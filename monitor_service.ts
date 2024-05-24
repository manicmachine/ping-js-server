import database_service, { UpdateMonitorDevice } from "./database_service";
import notification_service from "./notification_service";
import { MonitorDevice, MonitorTrigger, Proto } from "@prisma/client";
import { z } from "zod";
import { Ok, Err, Result } from 'ts-results-es';
import { isIP, Socket } from 'net';
import { lookup } from "dns";
import * as ping from 'net-ping';
import dgram from 'dgram';

const MonitorDeviceCreateSchema = z.object({
    name: z.string(),
    identifier: z.string(),
    port: z.number().optional(),
    proto: z.nativeEnum(Proto).default(Proto.ICMP),
    persist: z.boolean().default(false),
    monitor_trigger: z.nativeEnum(MonitorTrigger).default("OFFLINE"),
    monitor_start_utc: z.number().gte(0, {message: "Notification time range must be between 0000 and 2400"}).lte(2400, {message: "Notification time range must be between 0000 and 2400"}),
    monitor_end_utc: z.number().gte(0, {message: "Notification time range must be between 0000 and 2400"}).lte(2400, {message: "Notification time range must be between 0000 and 2400"}),
    requested_by: z.string(),
    notify: z.string(),
    comments: z.string().optional(),
    email_subject: z.string(),
    email_body: z.string()
})
const MonitorDeviceUpdateSchema = z.object({
    id: z.number(),
    name: z.string().optional(),
    identifier: z.string().optional(),
    port: z.number().optional(),
    proto: z.nativeEnum(Proto).optional(),
    persist: z.boolean().optional(),
    monitor_trigger: z.nativeEnum(MonitorTrigger).optional(),
    monitor_start_utc: z.number().gte(0, {message: "Notification time range must be between 0000 and 2400"}).lte(2400, {message: "Notification time range must be between 0000 and 2400"}).optional(),
    monitor_end_utc: z.number().gte(0, {message: "Notification time range must be between 0000 and 2400"}).lte(2400, {message: "Notification time range must be between 0000 and 2400"}).optional(),
    notify: z.string().optional(),
    comments: z.string().optional(),
    email_subject: z.string().optional(),
    email_body: z.string().optional(),
    been_notified: z.boolean().optional()
})

export { MonitorDevice, MonitorDeviceCreateSchema, MonitorDeviceUpdateSchema };

interface DeviceState {
    device: MonitorDevice,
    current_address: string,
    reachable: boolean | null
    persistent_alarm_ended: boolean
}


class MonitorService {
    private DEFAULT_FREQUENCY_MIN = "1";

    constructor() {
        const frequency_minutes = parseInt(process.env.MONITOR_FREQUENCY_MIN ?? this.DEFAULT_FREQUENCY_MIN);
        setInterval(() => this.processMonitorQueue(), frequency_minutes * 60 * 1000)
    }

    addDevices(devices: MonitorDevice[]): Promise<Result<MonitorDevice[], string>> {
        return database_service.createMonitorDevices(devices)
            .then(results => {
                return Ok(results);
            }).catch(error => {
                return Err(error as string)
            });
    }

    removeDevices(deviceIds: number[]): Promise<Result<null, string>> {
        return database_service.deleteMonitorDevices(deviceIds)
            .then(_ => {
                return Ok(null)
            })
            .catch(error => {
                return Err(error as string)
            });
    }

    updateDevices(devices: UpdateMonitorDevice[]): Promise<Result<MonitorDevice[], string>> {
        return database_service.updateMonitorDevices(devices)
            .then(results => {
                return Ok(results)
            })
            .catch(error => {
                return Err(error as string)
            });
    }

    getDevices(deviceIds: number[] | undefined): Promise<Result<MonitorDevice[], string>> {
        return database_service.getMonitorDevices(deviceIds)
            .then(results => {
                return Ok(results)
            })
            .catch(error => {
                return Err(error as string)
            })
    }

    async processMonitorQueue() {
        // Get devices within their monitoring window
        console.log("Starting monitor run")
        const date = new Date();
        const time_utc = (date.getUTCHours() * 100) + date.getUTCMinutes(); // Get the current UTC in 2400 format, minus the colon
        
        const deviceStates: DeviceState[] = (await database_service.getActiveMonitorDevicesForTime(time_utc)).map(device => {
            return {
                device: device,
                current_address: device.identifier,
                reachable: null,
                persistent_alarm_ended: false
            } as DeviceState
        });

        console.log(`Retrieved ${deviceStates.length} devices from monitor queue`);

        if (!deviceStates.length) {
            console.log('No devices in queue, exiting monitor run')
            return
        }

        // Test connectivity based upon monitor trigger and protocol
        await Promise.allSettled(deviceStates.map(async state => {
            await new Promise<DeviceState>((resolve, reject) => {
                if (!isIP(state.device.identifier)) {
                    console.log(`Resolving IP address for device ${state.device.id}, identifier ${state.device.identifier}`)
                    lookup(state.device.identifier, (error, address, _) => {
                        if (error) {
                            reject(error);
                        } else {
                            state.current_address = address;
                            console.log(`${state.device.identifier} resolved to ${address}`)
                            resolve(state);
                        }
                    })
                } else {
                    resolve(state);
                }
            })
            .then(async state => {
                console.log(`Testing connectivity of device ${state.device.id}, address ${state.current_address}`)
                switch (state.device.proto) {
                    case Proto.ICMP:
                        state.reachable = await this.checkIcmp(state.current_address);
                        break;
                    case Proto.TCP:
                        if (state.device.port) {
                            state.reachable = await this.checkTcpPort(state.current_address, state.device.port)
                        } else {
                            Promise.reject(`Device ${state.device.id} missing port but proto set to TCP`);
                        }
                        break;
                }
            })
            .catch(error => {
                console.error(error)
            });
        }));

        // Determine which devices need to generate notifications
        console.log('Connectivity checks finished, checking need to send notifications');
        const toBeNotified: DeviceState[] = []
        
        for (const state of deviceStates) {
            if (state.reachable == null) {
                //TODO: Improve error handling such that users know their record is throwing an error
                // Skip records that have thrown an error.
                console.error(`Skipping device ${state.device.id} as it has encountered an error and has no 'reachable' property.`);
                console.error(state);

                continue;
            }

            let shouldBeNotified: boolean;

            const reachableAndOnlineTriggered = (state.reachable && state.device.monitor_trigger == MonitorTrigger.ONLINE);
            const notReachableAndOfflineTriggered = (!state.reachable && state.device.monitor_trigger == MonitorTrigger.OFFLINE);
            const triggerCriteriaMet = reachableAndOnlineTriggered || notReachableAndOfflineTriggered

            if (!state.device.persist) {
                shouldBeNotified = triggerCriteriaMet;
            } else {
                /* 
                Send notification for persistent records when:
                - When notification hasn't already been sent AND trigger criteria is met
                - When notification HAS been sent AND trigger criteria is NO LONGER met
                    - Set persistent_alarm_ended to true
                */

                const triggeredAndHasntBeNotified = !state.device.been_notified && triggerCriteriaMet;
                const noLongerTriggeredAndHasBeenNotified = state.device.been_notified && !triggerCriteriaMet;
    
                shouldBeNotified = triggeredAndHasntBeNotified || noLongerTriggeredAndHasBeenNotified;
                if (noLongerTriggeredAndHasBeenNotified) state.persistent_alarm_ended = true;
            }

            console.log(`Device ${state.device.id} reachable: ${state.reachable}, trigger: ${state.device.monitor_trigger}, notification trigged: ${shouldBeNotified}, persistent: ${state.device.persist}`)
            if (shouldBeNotified) toBeNotified.push(state);
        }

        if (!toBeNotified.length) {
            console.log(`No devices triggered for notification. Monitor run finished.`);
            return;
        }

        console.log(`${toBeNotified.length} devices triggered for notification`);
        await notification_service.processMonitorNotifications(toBeNotified.map(state => state.device));

        // Remove non-persistent devices from queue
        const devicesToBeRemoved = toBeNotified.filter(state => !state.device.persist).map(state => state.device.id);
        if (devicesToBeRemoved.length) {
            console.log(`${devicesToBeRemoved.length} devices marked for removal`);
            console.log(`Deleting devices from queue: [${devicesToBeRemoved}]`)

            await database_service.deleteMonitorDevices(devicesToBeRemoved);
        } else {
            console.log('No devices marked for removal');
        }

        // Update been_notified flag for persistent records
        const pendingUpdate: MonitorDevice[] = [];
        for (const state of toBeNotified.filter(state => state.device.persist)) {
            if (state.persistent_alarm_ended) {
                state.device.been_notified = false;
            } else {
                state.device.been_notified = true;
            }

            pendingUpdate.push(state.device);
        }

        await database_service.updateMonitorDevices(pendingUpdate);
        console.log('Monitor run finished.');
    }

    private async checkIcmp(address: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            const session = ping.createSession();

            session.pingHost(address, (error: unknown, target: string) => {
                if (error) {
                    if (error instanceof ping.RequestTimedOutError) {
                        resolve(false)
                    } else {
                        reject(`Error pinging ${address}: ${error}`);
                    }
                } else {
                    resolve(true);
                }
            })
    })}

    private async checkTcpPort(address: string, port: number): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            console.log(`Testing TCP connectivity to ${address}:${port}`);
            const socket = new Socket();
            socket.setTimeout(2000);
            
            socket.connect(port, address, () => {
                console.log(`TCP connectivity to ${address}:${port}: ACTIVE`);
                socket.destroy();
                resolve(true);
            })

            socket.once('timeout', () => {
                console.log(`TCP connectivity to ${address}:${port}: INACTIVE`);
                socket.destroy();
                resolve(false);
            })

            socket.once('error', error => {
                socket.destroy();
                reject(`Error occured while opening TCP socket to ${address}:${port}: ${error}`)
            })
        })
    }

    /*NOTE: Checking UDP connectivity is unreliable due to the protocol being connectionless.
    Any approach to remedy this would be inconcistent at best, resulting in false alarms. 
    As such, this feature has been axed but the code shall remain as a reminder.*/

    // private async checkUdpPort(address: string, port: number): Promise<boolean> {
    //     return new Promise<boolean>((resolve, reject) => {
    //         console.log(`Testing UDP connectivity to ${address}:${port}`)
    //         const socket = dgram.createSocket('udp4');
    //         socket.send('ping', port, address, (error) => {
    //             console.log(`UDP connectivity to ${address}:${port}: ${!error ? "ACTIVE" : "INACTIVE"}`)
    //             socket.close();
    //             resolve(!error); // No error means port is likely open
    //         });
    //     })
    // }
}

const monitor_service = new MonitorService();
export default monitor_service;
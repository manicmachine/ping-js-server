import bcrypt from "bcrypt"; 
import { User, MonitorDevice, PrismaClient } from "@prisma/client";

export type UpdateMonitorDevice = Partial<MonitorDevice> & Pick<MonitorDevice, 'id'>;

class DatabaseService {
    private saltRounds = 12;
    private db_client: PrismaClient;

    constructor() {
        this.db_client = new PrismaClient();
    }
    
    async createUser(username: string, password: string) {
        const secret = await bcrypt.hash(password, this.saltRounds);
        
        return this.db_client.user.create({data: {username: username, secret: secret}});
    }
    
    async getUser(username: string) {
        return this.db_client.user.findFirst({where: {username: username}});
    }

    async updatePassword(username: string, password: string) {
        const secret = await bcrypt.hash(password, this.saltRounds);

        return this.db_client.user.update({where: {username: username}, data: {secret: secret}});
    }

    async deleteUser(username: string) {
        return this.db_client.user.delete({where: {username: username}});
    }

    async createMonitorDevices(devices: MonitorDevice[]) {
        return this.db_client.$transaction(
            devices.map(device => this.db_client.monitorDevice.create({ data: device })),
         );
    }

    async deleteMonitorDevices(devicesIds: number[]) {
        return this.db_client.monitorDevice.deleteMany({where: {id: {in: devicesIds}}});
    }

    async getMonitorDevices(deviceIds: number[] | undefined) {
        if (deviceIds == null) {
            return this.db_client.monitorDevice.findMany();
        } else {
            return this.db_client.monitorDevice.findMany({where: {id: {in: deviceIds}}});
        }
    }

    async getActiveMonitorDevicesForTime(time: number) {
        return this.db_client.monitorDevice.findMany({
            where: {
                monitor_start_utc: {
                    lte: time
                },
                monitor_end_utc: {
                    gte: time
                }
            }
        });
    }

    async updateMonitorDevices(devices: UpdateMonitorDevice[]) {
        return this.db_client.$transaction(
            devices.map(device =>
            this.db_client.monitorDevice.update({
                where: {id: device.id},
                data: {...device}
            })
        ));
    }
}

const database_service = new DatabaseService();
export default database_service;
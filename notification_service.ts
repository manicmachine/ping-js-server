import { MonitorDevice, MonitorTrigger } from "@prisma/client";
import * as mailer from 'nodemailer';

class NotificationService {
    private smtp_secure: boolean;
    private smtp_address: string;
    private smtp_port: number;
    private smtp_user: string | undefined;
    private smtp_pass: string | undefined;
    private smtp_from_addr: string | undefined;
    
    private transport: mailer.Transporter;

    constructor() {
        if (!process.env.SMTP_ADDRESS) {
            throw Error('No SMTP server defined in environment, so no notifications can be sent.')
        } 

        this.smtp_address = process.env.SMTP_ADDRESS;
        this.smtp_secure = JSON.parse(process.env.SMTP_SECURE ?? "true");
        this.smtp_port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT as string) : 25;
        this.smtp_user = process.env.SMTP_USER;
        this.smtp_pass = process.env.SMTP_PASS;
        this.smtp_from_addr = process.env.SMTP_FROM_ADDR;

        this.transport = mailer.createTransport({
            host: this.smtp_address,
            port: this.smtp_port,
            secure: this.smtp_secure,
            ignoreTLS: this.smtp_secure ? false : true,
            auth: this.smtp_user ? {
                user: this.smtp_user,
                pass: this.smtp_pass
            } : undefined
        });
    }

    // TODO: Implement the ability to send webhooks and slack/team notifications
    async processMonitorNotifications(devices: MonitorDevice[]) {
        for (const device of devices) {
            console.log(`Sending notification for device ${device.id} to ${device.notify}`)

            // If persistent record, check if the users have already been notified. If so, respond that the service is
            // back in it's non-trigger state
            let subject: string;
            let body: string | null = null;
            
            if (!device.been_notified) {
                subject = device.email_subject
                body = device.email_body
            } else {
                let state = device.monitor_trigger == MonitorTrigger.OFFLINE ? 'ONLINE' : 'OFFLINE';
                subject = `${device.identifier} is now ${state}`
            }

            // Send notification
            const send_info = await this.transport.sendMail({
                from: this.smtp_from_addr,
                to: device.notify,
                subject: subject,
                text: !body ? undefined : body
            })

            if (send_info.accepted.length > 0) {
                console.log(`Notifications sent to: ${send_info.accepted}`)
            }

            if (send_info.rejected.length > 0) {
                console.log(`Notifications failed to be sent to: ${send_info.reject}`)
            }
        }
    }
}

const notification_service = new NotificationService();
export default notification_service;
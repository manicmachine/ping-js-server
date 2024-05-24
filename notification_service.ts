import { MonitorDevice } from "@prisma/client";
import * as mailer from 'nodemailer';

class NotificationService {
    private smtp_address: string;
    private smtp_port: number;
    private smtp_user: string | undefined;
    private smtp_pass: string | undefined;
    
    private transport: mailer.Transporter;

    constructor() {
        if (!process.env.SMTP_ADDRESS) {
            throw Error('No SMTP server defined in environment, so no notifications can be sent.')
        } 

        this.smtp_address = process.env.SMTP_ADDRESS;
        this.smtp_port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT as string) : 465;
        this.smtp_user = process.env.SMTP_USER;
        this.smtp_pass = process.env.SMTP_PASS;

        this.transport = mailer.createTransport({
            host: this.smtp_address,
            port: this.smtp_port,
            secure: true,
            auth: this.smtp_user ? {
                user: this.smtp_user,
                pass: this.smtp_pass
            } : undefined
        });
    }

    // TODO: Implement the ability to send webhooks and slack/team notifications
    // TODO: Finish implementing email logic
    async processMonitorNotifications(devices: MonitorDevice[]) {
        for (const device of devices) {
            console.log(`Sending notification for device ${device.id} to ${device.notify}`)
        }
    }

    // TODO: Implement
    parseMessage(device: MonitorDevice): string {
        return 'todo';
    }
}

const notification_service = new NotificationService();
export default notification_service;
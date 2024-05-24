import { MonitorDevice, User } from "@prisma/client";

declare global {
    namespace Express {
        interface Request {
            user: string;
            auth_token: string;
        }
    }
}
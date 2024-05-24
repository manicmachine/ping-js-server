import bcrypt from "bcrypt"; 
import database_service from "./database_service";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

interface TokenPayload {
    exp: number,
    iat: number,
    user: string
}

class AuthService {
    private DEFAULT_FREQUENCY_MIN = "1";
    private jwt_key = process.env.TOKEN_SECRET as string;
    private revoked_tokens = new Map<string, number>();
    

    constructor() {
        const frequency_minutes = parseInt(process.env.PURGE_TOKEN_FREQUENCY_MIN ?? this.DEFAULT_FREQUENCY_MIN);
        setInterval(this.purgeRevokedTokens, frequency_minutes * 60 * 1000)
    }

    revokeToken(token: string) {
        this.revoked_tokens.set(token, (jwt.decode(token) as TokenPayload).exp);
    }

    generateAccessToken(username: any): {token: string, expires: number} {
        const auth_token = jwt.sign({user: username}, this.jwt_key, {expiresIn: 1800});
        const expires = (jwt.decode(auth_token) as TokenPayload).exp;

        return {token: auth_token, expires: expires};
    }

    async verifyUser(username: string, password: string): Promise<boolean> {
        let user = await database_service.getUser(username)
        
        if (!user) {
            return false;
        } else {
            return await bcrypt.compare(password, user.secret);
        }
    }

    validateToken = (req: Request, res: Response, next: NextFunction) => {
        if (!req.headers['authorization'] || !req.headers['authorization'].split(' ')[1]) {
            return res.sendStatus(401);
        }
    
        const authToken = req.headers['authorization'].split(' ')[1];
        jwt.verify(authToken, this.jwt_key, (err, payload) => {
            if (err || this.revoked_tokens.get(authToken)) {
                return res.sendStatus(403);
            } else {
                req.auth_token = authToken;
                req.user = (payload as TokenPayload).user;
                next();
            }
        });
    }

    purgeRevokedTokens = () => {
        const tokens_pending_removal: string[] = [];
        const current_time_seconds = Math.floor(Date.now() / 1000);

        this.revoked_tokens.forEach((value: number, key: string) => {
            if (value <= current_time_seconds) {
                tokens_pending_removal.push(key);
            }
        });

        tokens_pending_removal.forEach((token: string) => {
            this.revoked_tokens.delete(token);
        });
    }
}

const auth_service = new AuthService();
export default auth_service;
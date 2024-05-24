import dotenv from "dotenv";
import express, { Express, NextFunction, Request, Response } from "express";
import auth_service from "./auth_service";
import monitor_service, { MonitorDevice, MonitorDeviceCreateSchema, MonitorDeviceUpdateSchema } from "./monitor_service";

// TODO: Replace console statements with a proper logging library

// Configure server environment
dotenv.config();

const app = express()
app.use(express.json());

// Configure routes
app.get('/', (req, res) => {
    return res.send('Hello world!');
});

// Generate an auth token
app.post('/api/token', (req, res) => {
    if (!req.headers['authorization'] || !req.headers['authorization'].split(' ')[1]) {
        return res.sendStatus(401);
    }

    const [user, password] = Buffer.from(req.headers['authorization'].split(' ')[1], 'base64').toString().split(':');
    auth_service.verifyUser(user, password).then(valid => {
        if (valid) {
            return res.status(200).json(auth_service.generateAccessToken(user));
        } else {
            return res.sendStatus(401);
        }
    })
})

// Invalidate an auth token
app.delete('/api/token', auth_service.validateToken, (req, res) => {
    auth_service.revokeToken(req.auth_token);

    return res.sendStatus(200);
})

// Retrieve all or a subset of monitor devices
app.get('/api/devices', auth_service.validateToken, (req, res) => {
    if (Object.keys(req.body).length) {
        for (const id of req.body) {
            if ((typeof id) != "number") {
                return res.status(400).json({
                    "error": {
                        "object": id,
                        "issues": "Ids must be of type 'number'"
                    }
                });
            }
        }
    }

    monitor_service.getDevices(Object.keys(req.body).length ? req.body : undefined).then(results => {
        if (results.isOk()) {
            res.status(200).json({"count": results.value.length, "devices": results.value});
        } else {
            console.error(`Failed to retrieve devices {${req.body}} for ${req.user}: ${results.error}`)
            return res.sendStatus(500)
        }
    })
})

// Delete specified monitor devices
app.delete('/api/devices', auth_service.validateToken, (req, res) => {
    if (!Array.isArray(req.body)) {
        return res.status(400).json({"error": "Data must be contained within an array."});
    }

    const pendingDeletion: number[] = [];

    for (const id of req.body) {
        if ((typeof id) == "number") {
            pendingDeletion.push(id);
        } else {
            return res.status(400).json({
                "error": {
                    "object": id,
                    "issues": "Ids must be of type 'number'"
                }
            });
        }
    }

    monitor_service.removeDevices(pendingDeletion).then(results => {
        if (results.isOk()) {
            return res.sendStatus(200);
        } else {
            console.error(`Failed to delete devices {${req.body}} for ${req.user}: ${results.error}`)
            return res.sendStatus(500);
        }
    })
})

// // Create monitor devices
app.post('/api/devices', auth_service.validateToken, (req, res) => {
    if (!Array.isArray(req.body)) {
        return res.status(400).json({"error": "Data must be contained within an array."});
    }

    const pendingCreation: MonitorDevice[] = []

    for (const device of req.body) {
        device.requested_by = req.user;
        const result = MonitorDeviceCreateSchema.safeParse(device);

        if (result.error) {
            return res.status(400).json({
                "error": {
                    "object": device,
                    "issues": result.error.issues
                }
            });
        } else {
            pendingCreation.push((result.data as unknown) as MonitorDevice);
        }
    }

    monitor_service.addDevices(pendingCreation).then(results => {
        if (results.isOk()) {
            return res.status(200).json(results.value.map(device => device.id));
        } else {
            console.error(`Failed to create devices {${req.body}} for ${req.user}: ${results.error}`)
            return res.sendStatus(500);
        }
    })
})

// // Update monitor devices
app.put('/api/devices', auth_service.validateToken, (req, res) => {
    if (!Array.isArray(req.body)) {
        return res.status(400).json({"error": "Data must be contained within an array."});
    }

    const pendingUpdate: MonitorDevice[] = []

    for (const device of req.body) {
        const result = MonitorDeviceUpdateSchema.safeParse(device);

        if (result.error) {
            return res.status(400).json({
                "error": {
                    "object": device,
                    "issues": result.error.issues
                }
            });
        } else {
            pendingUpdate.push((result.data as unknown) as MonitorDevice);
        }
    }

    monitor_service.updateDevices(pendingUpdate).then(results => {
        if (results.isOk()) {
            return res.status(200).json(results.value.map(device => device.id));
        } else {
            console.error(`Failed to update devices {${req.body}} for ${req.user}: ${results.error}`)
            return res.sendStatus(500);
        }
    })
})

// TESTING
// TODO: remove me
// app.post('/api/user', (req, res) => {
//     database_service.createUser(req.body['user'], req.body['password']).then(() => {
//         return res.sendStatus(201);
//     })
// })

// Start server
app.listen(process.env.PORT as string, () => {
    console.log(`PingJS listening on port ${process.env.PORT}`)
})
import { spicedbFetch } from '../../../lib/spicedb';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const { resource, permission, subject, context } = req.body;

        // Validate required fields
        if (!resource || !permission || !subject) {
            return res.status(400).json({
                message: 'Missing required fields: resource, permission, subject'
            });
        }

        const requestBody = {
            resource,
            permission,
            subject,
            ...(context && { context })
        };

        const response = await spicedbFetch('/v1/permissions/check', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                message: `SpiceDB error: ${errorText}`
            });
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        console.error('Check API error:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: error.message
        });
    }
}

import { spicedbFetch } from '../../../lib/spicedb';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        let stats = {
            totalDefinitions: 0,
            totalRelationships: 0,
            totalSubjects: 0,
            uniqueResourceTypes: [],
            uniqueSubjectTypes: [],
            lastUpdate: new Date().toISOString(),
            isConnected: false
        };

        // Test connection and get schema
        try {
            const schemaResponse = await spicedbFetch('/v1/schema/read', {
                method: 'POST',
                body: JSON.stringify({})
            });

            if (schemaResponse.ok) {
                stats.isConnected = true;
                const schemaData = await schemaResponse.json();
                const definitions = extractDefinitionsFromSchema(schemaData.schemaText || '');
                stats.totalDefinitions = definitions.length;
                stats.uniqueResourceTypes = definitions;
            }
        } catch (error) {
            console.error('Error fetching schema:', error);
            stats.isConnected = false;
        }

        res.status(200).json(stats);

    } catch (error) {
        console.error('Stats API error:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: error.message
        });
    }
}

// Helper function to extract definitions from schema
function extractDefinitionsFromSchema(schemaText) {
    const definitionRegex = /definition\s+(\w+)\s*{/g;
    const definitions = [];
    let match;

    while ((match = definitionRegex.exec(schemaText)) !== null) {
        definitions.push(match[1]);
    }

    return definitions;
}

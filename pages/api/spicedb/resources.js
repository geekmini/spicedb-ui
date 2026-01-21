import { spicedbFetch } from '../../../lib/spicedb';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        // Get schema to extract resource types and their relations
        const schemaResponse = await spicedbFetch('/v1/schema/read', {
            method: 'POST',
            body: JSON.stringify({})
        });

        if (!schemaResponse.ok) {
            const errorText = await schemaResponse.text();
            return res.status(schemaResponse.status).json({
                message: `SpiceDB error: ${errorText}`
            });
        }

        const schemaData = await schemaResponse.json();
        const schemaText = schemaData.schemaText || '';

        // Extract resource types and their relations/permissions
        const resourceTypes = parseDefinitions(schemaText);

        res.status(200).json({
            resourceTypes
        });

    } catch (error) {
        console.error('Resources API error:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: error.message
        });
    }
}

const parseDefinitions = (schema) => {
    // Parse definitions from current schema
    const definitionRegex = /definition\s+(\w+)\s*\{/g;
    const found = [];
    let match;

    while ((match = definitionRegex.exec(schema)) !== null) {
        found.push({
            name: match[1],
            relations: extractRelations(match[1], schema),
            permissions: extractPermissions(match[1], schema)
        });
    }

    return found;
};

const extractRelations = (definitionName, schemaText) => {
    const definitionBlock = extractDefinitionBlock(definitionName, schemaText);
    const relationRegex = /relation\s+(\w+):\s*([^\n\r]+)/g;
    const relations = [];
    let match;

    while ((match = relationRegex.exec(definitionBlock)) !== null) {
        relations.push({
            name: match[1],
            type: match[2].trim()
        });
    }
    return relations;
};

const extractPermissions = (definitionName, schemaText) => {
    const definitionBlock = extractDefinitionBlock(definitionName, schemaText);
    const permissionRegex = /permission\s+(\w+)\s*=\s*([^\n\r]+)/g;
    const permissions = [];
    let match;

    while ((match = permissionRegex.exec(definitionBlock)) !== null) {
        permissions.push({
            name: match[1],
            expression: match[2].trim()
        });
    }
    return permissions;
};

const extractDefinitionBlock = (definitionName, schemaText) => {
    const startRegex = new RegExp(`definition\\s+${definitionName}\\s*\\{`);
    const startMatch = schemaText.match(startRegex);
    if (!startMatch) return '';

    const startIndex = startMatch.index + startMatch[0].length;
    let braceCount = 1;
    let endIndex = startIndex;

    for (let i = startIndex; i < schemaText.length && braceCount > 0; i++) {
        if (schemaText[i] === '{') braceCount++;
        if (schemaText[i] === '}') braceCount--;
        endIndex = i;
    }

    return schemaText.substring(startIndex, endIndex);
};

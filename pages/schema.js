import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Layout from '../components/Layout';

// Dynamically import CodeMirror to avoid SSR issues
const CodeMirror = dynamic(
    () => import('@uiw/react-codemirror'),
    {
        ssr: false,
        loading: () => (
            <div
                className="w-full bg-gray-900 border border-gray-700 rounded-md animate-pulse"
                style={{ minHeight: 'calc(100vh - 300px)' }}
            >
                <div className="p-4 text-gray-500">Loading editor...</div>
            </div>
        )
    }
);

const Schema = () => {
    const [schema, setSchema] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [editorExtensions, setEditorExtensions] = useState([]);
    const [editorTheme, setEditorTheme] = useState(undefined);
    const [isEditorReady, setIsEditorReady] = useState(false);

    // Load CodeMirror extensions on client side
    useEffect(() => {
        const loadExtensions = async () => {
            try {
                const [
                    { javascript },
                    { vscodeDark }
                ] = await Promise.all([
                    import('@codemirror/lang-javascript'),
                    import('@uiw/codemirror-theme-vscode')
                ]);

                setEditorExtensions([javascript()]);
                setEditorTheme(vscodeDark);
                setIsEditorReady(true);
            } catch (err) {
                console.error('Failed to load editor extensions:', err);
                setIsEditorReady(true); // Still show editor without extensions
            }
        };

        loadExtensions();
    }, []);

    const loadSchema = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const response = await fetch('/api/spicedb/schema');

            if (response.ok) {
                const data = await response.text();
                setSchema(data);
            } else {
                const errorData = await response.json();
                if (errorData.message?.includes('No schema has been defined')) {
                    setError('No schema defined yet. You can create one using the editor below.');
                } else {
                    setError(`Failed to load schema: ${errorData.message}`);
                }
            }
        } catch (err) {
            setError(`Connection error: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSchema();
    }, [loadSchema]);

    const saveSchema = async () => {
        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            const response = await fetch('/api/spicedb/schema', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: schema
            });

            if (response.ok) {
                setSuccess('Schema updated successfully');
            } else {
                const errorData = await response.json();
                setError(`Failed to update schema: ${errorData.message}`);
            }
        } catch (err) {
            setError(`Connection error: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditorChange = useCallback((value) => {
        setSchema(value);
    }, []);

    return (
        <Layout>
            <div className="space-y-6">
                {/* Alerts */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-center">
                            <span className="text-red-600 mr-2">❌</span>
                            <div>
                                <h3 className="text-sm font-medium text-red-800">Error</h3>
                                <pre className="text-sm text-red-700 whitespace-pre-wrap">{error}</pre>
                            </div>
                        </div>
                    </div>
                )}

                {success && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center">
                            <span className="text-green-600 mr-2">✅</span>
                            <div>
                                <h3 className="text-sm font-medium text-green-800">Success</h3>
                                <p className="text-sm text-green-700">{success}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Schema Editor */}
                <div className="bg-white shadow rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg leading-6 font-medium text-gray-900">Schema Definition</h3>
                            <div className="flex space-x-3">
                                <button
                                    onClick={loadSchema}
                                    disabled={isLoading}
                                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                >
                                    {isLoading ? 'Loading...' : 'Reload'}
                                </button>
                                <button
                                    onClick={saveSchema}
                                    disabled={isLoading}
                                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                >
                                    {isLoading ? 'Saving...' : 'Save Schema'}
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 rounded-md overflow-hidden border border-gray-700">
                            {isEditorReady ? (
                                <CodeMirror
                                    value={schema}
                                    onChange={handleEditorChange}
                                    theme={editorTheme}
                                    extensions={editorExtensions}
                                    placeholder="Enter your SpiceDB schema definition..."
                                    basicSetup={{
                                        lineNumbers: true,
                                        highlightActiveLineGutter: true,
                                        highlightSpecialChars: true,
                                        foldGutter: true,
                                        drawSelection: true,
                                        dropCursor: true,
                                        allowMultipleSelections: true,
                                        indentOnInput: true,
                                        bracketMatching: true,
                                        closeBrackets: true,
                                        autocompletion: false,
                                        rectangularSelection: true,
                                        crosshairCursor: false,
                                        highlightActiveLine: true,
                                        highlightSelectionMatches: true,
                                        closeBracketsKeymap: true,
                                        searchKeymap: true,
                                        foldKeymap: true,
                                        completionKeymap: false,
                                        lintKeymap: false,
                                    }}
                                    style={{
                                        fontSize: 14,
                                    }}
                                    height="calc(100vh - 300px)"
                                />
                            ) : (
                                <div
                                    className="w-full bg-gray-900 animate-pulse"
                                    style={{ minHeight: 'calc(100vh - 300px)' }}
                                >
                                    <div className="p-4 text-gray-500">Loading editor...</div>
                                </div>
                            )}
                        </div>

                        <div className="mt-4 text-sm text-gray-500">
                            <p>
                                <strong>Tip:</strong> Use the SpiceDB schema language to define your authorization model.
                                Start with <code className="bg-gray-100 px-1 py-0.5 rounded">definition</code> blocks
                                and define <code className="bg-gray-100 px-1 py-0.5 rounded">relation</code> and
                                <code className="bg-gray-100 px-1 py-0.5 rounded">permission</code> statements.
                                Use <code className="bg-gray-100 px-1 py-0.5 rounded">Ctrl/Cmd + Shift + [</code> to fold code blocks.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default Schema;

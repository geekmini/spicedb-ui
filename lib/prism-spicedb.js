import Prism from 'prismjs';

// Define SpiceDB schema language for Prism
Prism.languages.spicedb = {
    'comment': {
        pattern: /\/\/.*/,
        greedy: true
    },
    'keyword': /\b(definition|relation|permission)\b/,
    'operator': /[&|+\->=]/,
    'function': /\b(nil)\b/,
    'class-name': /\b(user|role|team|document|organization|group|resource)\b/,
    'symbol': /#/,
    'punctuation': /[{}:,*]/,
    'arrow': /->/,
};

export const highlight = (code) => {
    return Prism.highlight(code, Prism.languages.spicedb, 'spicedb');
};

export default Prism;

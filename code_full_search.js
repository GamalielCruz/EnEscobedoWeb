const fs = require('fs');
const path = require('path');

function searchInDir(dir, target) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        searchInDir(filePath, target);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.json')) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.toLowerCase().includes(target.toLowerCase())) {
        console.log(`MATCH FOUND IN: ${filePath}`);
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (line.toLowerCase().includes(target.toLowerCase())) {
            console.log(`  Line ${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

searchInDir('.', 'Explora nuestras tiendas');

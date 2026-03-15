const readline = require('node:readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'input> '
});

const startedAt = new Date();

console.log('[wait-for-input] Ready.');
console.log('[wait-for-input] Type anything and press Enter.');
console.log('[wait-for-input] Type "exit" or "quit" to stop.');
console.log(`[wait-for-input] Started at: ${startedAt.toISOString()}`);

rl.prompt();

rl.on('line', (line) => {
  const value = String(line ?? '').trim();

  if (value === 'exit' || value === 'quit') {
    console.log('[wait-for-input] Exit requested.');
    rl.close();
    return;
  }

  if (value.length === 0) {
    console.log('[wait-for-input] Empty input received. Waiting again.');
    rl.prompt();
    return;
  }

  console.log(`[wait-for-input] Received: ${value}`);
  rl.prompt();
});

rl.on('SIGINT', () => {
  console.log('\n[wait-for-input] Ctrl+C blocked. Type "exit" or "quit" to stop.');
  rl.prompt();
});

rl.on('close', () => {
  console.log('[wait-for-input] Closed.');
  process.exit(0);
});

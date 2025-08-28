#!/usr/bin/env node

const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const { Scanner } = require('../src/scanner');

async function main() {
  const argv = yargs(hideBin(process.argv))
    .scriptName('nosqli-scan')
    .usage('$0 <url> [options]')
    .positional('url', { describe: 'Target URL', type: 'string' })
    .option('get-params', { alias: 'g', describe: 'Comma-separated GET params to test', type: 'string' })
    .option('method', { alias: 'X', describe: 'HTTP method for body scan', type: 'string', default: 'POST' })
    .option('fields', { alias: 'f', describe: 'Comma-separated JSON body fields to test', type: 'string' })
    .option('body', { alias: 'd', describe: 'Base JSON body string', type: 'string' })
    .option('timeout', { alias: 't', describe: 'Timeout per request (ms)', type: 'number', default: 8000 })
    .option('delay', { alias: 'D', describe: 'Delay between requests (ms)', type: 'number', default: 50 })
    .demandCommand(1)
    .help()
    .argv;

  const url = argv._[0];
  const scanner = new Scanner({ timeoutMs: argv.timeout, delayMs: argv.delay });

  let findings = [];

  if (argv.getParams) {
    const params = String(argv.getParams).split(',').map(s => s.trim()).filter(Boolean);
    const res = await scanner.scanGet(url, params);
    findings = findings.concat(res);
  }

  if (argv.fields) {
    const fields = String(argv.fields).split(',').map(s => s.trim()).filter(Boolean);
    let baseBody = {};
    if (argv.body) {
      try { baseBody = JSON.parse(argv.body); } catch { console.error('Invalid JSON in --body'); }
    }
    const res = await scanner.scanBody(url, argv.method, baseBody, fields);
    findings = findings.concat(res);
  }

  if (!findings.length) {
    console.log('No obvious NoSQLi indicators found.');
  } else {
    console.log(JSON.stringify(findings, null, 2));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

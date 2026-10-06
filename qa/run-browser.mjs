import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const qa=path.dirname(fileURLToPath(import.meta.url));
const regressions=process.argv.includes('--regressions');
const args=regressions?[path.join(qa,'run-regressions.mjs')]:[path.join(qa,'node_modules/@playwright/test/cli.js'),'test',...process.argv.slice(2)];
const child=spawn(process.execPath,args,{cwd:qa,env:process.env,stdio:'inherit'});
child.on('close',code=>process.exitCode=code??1);

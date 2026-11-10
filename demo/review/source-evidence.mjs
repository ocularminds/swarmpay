import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

/** Bind results to edited source as well as its parent commit. Excludes private inputs and generated reports. */
export function sourceEvidence(root) {
  const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--',
    'apps','modules','infra','demo','contracts','.github','compose.yml','build.gradle.kts','settings.gradle.kts'],{cwd:root,encoding:'utf8'})
    .trim().split('\n').filter(Boolean).sort();
  const hash=createHash('sha256');
  for(const path of paths)hash.update(path+'\0').update(readFileSync(resolve(root,path))).update('\0');
  return {baseRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    sourceFingerprintSha256:hash.digest('hex'),sourceFileCount:paths.length,
    sourceScope:'Tracked and new non-ignored application, module, infrastructure, demo, contract and CI files; excludes private configuration and generated reports.'};
}

/**
 * Cross-platform whisper.cpp binary availability check.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export function isWhisperBinAvailable(whisperBin: string): boolean {
  const bin = whisperBin.trim();
  if (!bin) return false;

  if (path.isAbsolute(bin) || bin.includes('/') || bin.includes('\\')) {
    try {
      fs.accessSync(bin, fs.constants.X_OK);
      return true;
    } catch {
      try {
        fs.accessSync(bin, fs.constants.R_OK);
        return true;
      } catch {
        return false;
      }
    }
  }

  const isWin = process.platform === 'win32';
  const lookupCmd = isWin ? 'where' : 'which';
  try {
    const check = spawnSync(lookupCmd, [bin], { stdio: 'ignore', shell: isWin });
    return check.status === 0;
  } catch {
    return false;
  }
}

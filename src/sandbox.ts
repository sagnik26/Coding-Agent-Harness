export interface ExecResult {
  stdout: string;
  exitCode: number;
}

export interface ExecOptions {
  /** Called for each stdout chunk as it arrives. Full stdout is still returned. */
  onStdout?: (chunk: string) => void;
}

export interface Sandbox {
  type: string;
  workingDirectory: string;
  readFile(path: string): Promise<string>;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  stop(): Promise<void>;
  expiresAt?: number;
  snapshot?(): Promise<{ snapshotId: string }>;
}

export interface ExecResult {
  stdout: string;
  exitCode: number;
}

export interface ExecOptions {
  /** Called for each stdout chunk as it arrives. Full stdout is still returned. */
  onStdout?: (chunk: string) => void;
}

export interface SandboxLifecycleHooks {
  /** Run after the sandbox is created (e.g. clone repo, install deps). */
  afterStart?: (sandbox: Sandbox) => Promise<void>;
  /** Run before the sandbox stops (e.g. upload artifacts). */
  beforeStop?: (sandbox: Sandbox) => Promise<void>;
  /** Run when the sandbox is about to time out (e.g. snapshot state). */
  onTimeout?: (sandbox: Sandbox) => Promise<void>;
}

export interface Sandbox {
  type: string;
  workingDirectory: string;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  stop(): Promise<void>;
  expiresAt?: number;
  snapshot?(): Promise<{ snapshotId: string }>;
  /** Optional — used by chaos mode and cloud lifecycle checks. */
  getStatus?(): Promise<{ state: string; expiresAt?: number }>;
}

import axios from 'axios';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import crypto from 'crypto';

// Judge0 language IDs
const LANGUAGE_IDS: Record<string, number> = {
  C: 50,       // C (GCC 9.2.0)
  JAVA: 62,    // Java (OpenJDK 13.0.1)
  PYTHON: 71,  // Python (3.8.1)
};

const JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || '';

interface SubmissionResult {
  status: {
    id: number;
    description: string;
  };
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null;
  memory: number | null;
  token?: string;
}

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
};
if (JUDGE0_API_KEY) {
  headers['X-RapidAPI-Key'] = JUDGE0_API_KEY;
  headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com';
}

function decodeBase64(s: string | null | undefined): string {
  if (!s) return '';
  try {
    return Buffer.from(s, 'base64').toString('utf8').trim();
  } catch {
    return s;
  }
}

function normalizeOutput(str: string): string {
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Run a process with timeout and return stdout/stderr/exitCode.
 */
function runProcess(
  cmd: string,
  args: string[],
  stdin: string,
  timeoutMs = 5000,
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    let timedOut = false;
    let stdout = '';
    let stderr = '';

    const child = spawn(cmd, args, {
      cwd: cwd || os.tmpdir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch {}
    }, timeoutMs);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: err.message, exitCode: 1, timedOut: false });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });

    try {
      if (stdin) {
        child.stdin?.write(stdin);
      }
      child.stdin?.end();
    } catch {
      // Stream might be closed
    }
  });
}

/**
 * Local Native Fallback Runner
 * Executes code locally when Judge0 (Docker) is unavailable.
 */
export async function runCodeLocally(
  language: string,
  sourceCode: string,
  stdin: string,
  expectedOutput: string
): Promise<{
  passed: boolean;
  compilationError: boolean;
  compileOutput: string;
  stderr: string;
  statusDescription: string;
}> {
  const tmpDir = os.tmpdir();
  const runId = crypto.randomBytes(6).toString('hex');

  // --- PYTHON ---
  if (language === 'PYTHON') {
    const filePath = path.join(tmpDir, `solution_${runId}.py`);
    try {
      fs.writeFileSync(filePath, sourceCode, 'utf8');
      const pythonCmd = process.platform === 'win32'
        ? (fs.existsSync('C:\\Python314\\python.exe') ? 'C:\\Python314\\python.exe' : 'python')
        : 'python3';

      const result = await runProcess(pythonCmd, [filePath], stdin, 5000);

      if (result.timedOut) {
        return { passed: false, compilationError: false, compileOutput: '', stderr: '', statusDescription: 'Time Limit Exceeded' };
      }

      if (result.exitCode !== 0) {
        const isSyntax = result.stderr.includes('SyntaxError') || result.stderr.includes('IndentationError');
        return {
          passed: false,
          compilationError: isSyntax,
          compileOutput: isSyntax ? result.stderr : '',
          stderr: result.stderr,
          statusDescription: isSyntax ? 'Compilation Error' : 'Runtime Error',
        };
      }

      const passed = normalizeOutput(result.stdout) === normalizeOutput(expectedOutput);
      return {
        passed,
        compilationError: false,
        compileOutput: '',
        stderr: '',
        statusDescription: passed ? 'Accepted' : 'Wrong Answer',
      };
    } finally {
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    }
  }

  // --- JAVA ---
  if (language === 'JAVA') {
    const javaDir = path.join(tmpDir, `java_${runId}`);
    try {
      fs.mkdirSync(javaDir, { recursive: true });
      const filePath = path.join(javaDir, 'Main.java');
      fs.writeFileSync(filePath, sourceCode, 'utf8');

      const javacCmd = 'javac';
      const compileRes = await runProcess(javacCmd, ['-encoding', 'UTF-8', 'Main.java'], '', 8000, javaDir);
      if (compileRes.exitCode !== 0) {
        return {
          passed: false,
          compilationError: true,
          compileOutput: compileRes.stderr || 'Compilation failed',
          stderr: compileRes.stderr,
          statusDescription: 'Compilation Error',
        };
      }

      const javaCmd = 'java';
      const runRes = await runProcess(javaCmd, ['-cp', '.', 'Main'], stdin, 5000, javaDir);
      if (runRes.timedOut) {
        return { passed: false, compilationError: false, compileOutput: '', stderr: '', statusDescription: 'Time Limit Exceeded' };
      }
      if (runRes.exitCode !== 0) {
        return {
          passed: false,
          compilationError: false,
          compileOutput: '',
          stderr: runRes.stderr,
          statusDescription: 'Runtime Error',
        };
      }

      const passed = normalizeOutput(runRes.stdout) === normalizeOutput(expectedOutput);
      return {
        passed,
        compilationError: false,
        compileOutput: '',
        stderr: '',
        statusDescription: passed ? 'Accepted' : 'Wrong Answer',
      };
    } finally {
      try { fs.rmSync(javaDir, { recursive: true, force: true }); } catch {}
    }
  }

  // --- C ---
  if (language === 'C') {
    const cDir = path.join(tmpDir, `c_${runId}`);
    try {
      fs.mkdirSync(cDir, { recursive: true });
      const cFile = path.join(cDir, 'main.c');
      const exeFile = path.join(cDir, process.platform === 'win32' ? 'main.exe' : 'main');
      fs.writeFileSync(cFile, sourceCode, 'utf8');

      const compileRes = await runProcess('gcc', ['-O2', 'main.c', '-o', exeFile], '', 8000, cDir);
      if (compileRes.stderr.includes('not recognized') || compileRes.stderr.includes('ENOENT')) {
        return {
          passed: false,
          compilationError: true,
          compileOutput: 'GCC compiler is not installed locally on this server. Please install GCC or run with Python/Java.',
          stderr: 'GCC not found',
          statusDescription: 'Compilation Error',
        };
      }

      if (compileRes.exitCode !== 0) {
        return {
          passed: false,
          compilationError: true,
          compileOutput: compileRes.stderr || 'Compilation failed',
          stderr: compileRes.stderr,
          statusDescription: 'Compilation Error',
        };
      }

      const runRes = await runProcess(exeFile, [], stdin, 5000, cDir);
      if (runRes.timedOut) {
        return { passed: false, compilationError: false, compileOutput: '', stderr: '', statusDescription: 'Time Limit Exceeded' };
      }
      if (runRes.exitCode !== 0) {
        return {
          passed: false,
          compilationError: false,
          compileOutput: '',
          stderr: runRes.stderr,
          statusDescription: 'Runtime Error',
        };
      }

      const passed = normalizeOutput(runRes.stdout) === normalizeOutput(expectedOutput);
      return {
        passed,
        compilationError: false,
        compileOutput: '',
        stderr: '',
        statusDescription: passed ? 'Accepted' : 'Wrong Answer',
      };
    } finally {
      try { fs.rmSync(cDir, { recursive: true, force: true }); } catch {}
    }
  }

  return {
    passed: false,
    compilationError: false,
    compileOutput: '',
    stderr: 'Unsupported language',
    statusDescription: 'Wrong Answer',
  };
}

/**
 * Submit code to Judge0 and wait for result.
 */
export async function runCode(
  language: string,
  sourceCode: string,
  stdin: string,
  expectedOutput: string
): Promise<{
  passed: boolean;
  compilationError: boolean;
  compileOutput: string;
  stderr: string;
  statusDescription: string;
}> {
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const payload = {
    language_id: languageId,
    source_code: Buffer.from(sourceCode).toString('base64'),
    stdin: Buffer.from(stdin).toString('base64'),
    expected_output: Buffer.from(expectedOutput).toString('base64'),
    cpu_time_limit: 5,
    cpu_extra_time: 1,
    wall_time_limit: 10,
    memory_limit: 128000,
    stack_limit: 64000,
    process_limit: 30,
    max_file_size: 1024,
    enable_network: false,
    base64_encoded: true,
  };

  const createResp = await axios.post(
    `${JUDGE0_URL}/submissions?base64_encoded=true&wait=true`,
    payload,
    { headers, timeout: 10000 }
  );

  const result: SubmissionResult = createResp.data;

  const compileOutput = decodeBase64(result.compile_output);
  const stderr = decodeBase64(result.stderr);
  const stdout = decodeBase64(result.stdout);

  const statusId = result.status?.id;
  const statusDescription = result.status?.description || 'Unknown';
  const compilationError = statusId === 6;
  const passed = statusId === 3;

  return {
    passed,
    compilationError,
    compileOutput: compileOutput || '',
    stderr: stderr || '',
    statusDescription,
  };
}

/**
 * Run code against all hidden test cases for a question.
 * Uses Judge0 if available; automatically falls back to local execution.
 */
export async function evaluateCode(
  language: string,
  sourceCode: string,
  testCases: Array<{ input_data: string; expected_output: string; is_hidden: boolean }>
): Promise<{
  compilationError: boolean;
  compileOutput: string;
  totalTests: number;
  passedTests: number;
  status: 'ACCEPTED' | 'WRONG_ANSWER' | 'COMPILE_ERROR' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED';
  safeMessage: string;
}> {
  if (testCases.length === 0) {
    return {
      compilationError: false,
      compileOutput: '',
      totalTests: 0,
      passedTests: 0,
      status: 'WRONG_ANSWER',
      safeMessage: 'No test cases configured.',
    };
  }

  let passedTests = 0;
  let compilationError = false;
  let compileOutput = '';
  let overallStatus: 'ACCEPTED' | 'WRONG_ANSWER' | 'COMPILE_ERROR' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED' = 'ACCEPTED';
  let useLocal = false;

  for (const tc of testCases) {
    let result: {
      passed: boolean;
      compilationError: boolean;
      compileOutput: string;
      stderr: string;
      statusDescription: string;
    };

    if (!useLocal) {
      try {
        result = await runCode(language, sourceCode, tc.input_data, tc.expected_output);
      } catch {
        useLocal = true;
        result = await runCodeLocally(language, sourceCode, tc.input_data, tc.expected_output);
      }
    } else {
      result = await runCodeLocally(language, sourceCode, tc.input_data, tc.expected_output);
    }

    if (result.compilationError) {
      compilationError = true;
      compileOutput = result.compileOutput;
      overallStatus = 'COMPILE_ERROR';
      break;
    }

    if (result.statusDescription === 'Time Limit Exceeded') {
      overallStatus = 'TIME_LIMIT_EXCEEDED';
      break;
    }

    if (result.statusDescription === 'Runtime Error' || result.statusDescription === 'Runtime Error (NZEC)') {
      overallStatus = 'RUNTIME_ERROR';
    }

    if (result.passed) {
      passedTests++;
    } else if (overallStatus === 'ACCEPTED') {
      overallStatus = 'WRONG_ANSWER';
    }
  }

  if (passedTests === testCases.length) {
    overallStatus = 'ACCEPTED';
  }

  let safeMessage: string;
  if (compilationError) {
    safeMessage = compileOutput.includes('GCC compiler is not installed')
      ? 'GCC compiler is not installed on this server. Please use Python or Java, or install MinGW.'
      : 'Compiled with error';
  } else {
    safeMessage = 'Compiled without error';
  }

  return {
    compilationError,
    compileOutput: compilationError ? (compileOutput || '(Compilation errors found — check your code)') : '',
    totalTests: testCases.length,
    passedTests,
    status: overallStatus,
    safeMessage,
  };
}

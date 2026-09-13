import axios from 'axios';

// Judge0 language IDs
export const LANGUAGE_IDS: Record<string, number> = {
  C: 50,       // C (GCC 9.2.0)
  JAVA: 62,    // Java (OpenJDK 13.0.1)
  PYTHON: 71,  // Python (3.8.1)
};

const JUDGE_URL = (
  process.env.JUDGE_URL ||
  process.env.JUDGE0_URL ||
  'http://localhost:2358'
).replace(/\/+$/, '');

const JUDGE_API_KEY = process.env.JUDGE_API_KEY || process.env.JUDGE0_API_KEY || '';
const JUDGE_HOST = process.env.JUDGE_HOST || process.env.JUDGE0_HOST || 'judge0-ce.p.rapidapi.com';

export interface SubmissionResult {
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

export interface JudgeExecutionResult {
  passed: boolean;
  compilationError: boolean;
  compileOutput: string;
  stdout: string;
  stderr: string;
  statusDescription: string;
  token?: string;
}

export interface TestCase {
  input_data: string;
  expected_output: string;
  is_hidden?: boolean;
}

export interface EvaluationResult {
  compilationError: boolean;
  compileOutput: string;
  totalTests: number;
  passedTests: number;
  status: 'ACCEPTED' | 'WRONG_ANSWER' | 'COMPILE_ERROR' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED';
  safeMessage: string;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (JUDGE_API_KEY) {
    headers['X-RapidAPI-Key'] = JUDGE_API_KEY;
    headers['X-RapidAPI-Host'] = JUDGE_HOST;
    headers['X-Auth-Token'] = JUDGE_API_KEY;
  }
  return headers;
}

function decodeBase64(s: string | null | undefined): string {
  if (!s) return '';
  try {
    return Buffer.from(s, 'base64').toString('utf8').trim();
  } catch {
    return s;
  }
}

/**
 * Submit code to an external sandboxed judge service.
 * Supports C, Java, and Python.
 * Never executes code inside the serverless runtime.
 */
export async function submitCode(
  language: string,
  sourceCode: string,
  stdin: string = '',
  expectedOutput?: string
): Promise<JudgeExecutionResult> {
  const normalizedLang = language.toUpperCase();
  const languageId = LANGUAGE_IDS[normalizedLang];
  if (!languageId) {
    throw new Error(`Unsupported language: ${language}. Supported languages: C, JAVA, PYTHON`);
  }

  const payload: Record<string, any> = {
    language_id: languageId,
    source_code: Buffer.from(sourceCode).toString('base64'),
    stdin: Buffer.from(stdin).toString('base64'),
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

  if (expectedOutput !== undefined) {
    payload.expected_output = Buffer.from(expectedOutput).toString('base64');
  }

  try {
    const response = await axios.post(
      `${JUDGE_URL}/submissions?base64_encoded=true&wait=true`,
      payload,
      {
        headers: getHeaders(),
        timeout: 15000,
      }
    );

    const result: SubmissionResult = response.data;
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
      stdout,
      stderr: stderr || '',
      statusDescription,
      token: result.token,
    };
  } catch (err: any) {
    const errorMessage = err.response?.data?.message || err.message || 'Judge execution failed';
    console.error(`Judge service error (${JUDGE_URL}):`, errorMessage);
    throw new Error(`Code judge error: ${errorMessage}`);
  }
}

/**
 * Check the status of an asynchronous submission by token.
 */
export async function checkStatus(token: string): Promise<JudgeExecutionResult> {
  try {
    const response = await axios.get(
      `${JUDGE_URL}/submissions/${token}?base64_encoded=true`,
      {
        headers: getHeaders(),
        timeout: 10000,
      }
    );

    const result: SubmissionResult = response.data;
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
      stdout,
      stderr: stderr || '',
      statusDescription,
      token: result.token,
    };
  } catch (err: any) {
    throw new Error(`Failed to check judge submission status: ${err.message}`);
  }
}

/**
 * Evaluates code against multiple test cases using the external sandboxed judge.
 */
export async function evaluateSubmission(
  language: string,
  sourceCode: string,
  testCases: TestCase[]
): Promise<EvaluationResult> {
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

  for (const tc of testCases) {
    let result: JudgeExecutionResult;
    try {
      result = await submitCode(language, sourceCode, tc.input_data, tc.expected_output);
    } catch (err: any) {
      return {
        compilationError: true,
        compileOutput: 'External judge communication failed. Please try again.',
        totalTests: testCases.length,
        passedTests: 0,
        status: 'COMPILE_ERROR',
        safeMessage: 'Compiled with error',
      };
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

    if (
      result.statusDescription === 'Runtime Error' ||
      result.statusDescription === 'Runtime Error (NZEC)'
    ) {
      overallStatus = 'RUNTIME_ERROR';
    }

    if (result.passed) {
      passedTests++;
    } else if (overallStatus === 'ACCEPTED') {
      overallStatus = 'WRONG_ANSWER';
    }
  }

  if (passedTests === testCases.length && !compilationError) {
    overallStatus = 'ACCEPTED';
  }

  const safeMessage = compilationError ? 'Compiled with error' : 'Compiled without error';

  return {
    compilationError,
    compileOutput: compilationError
      ? (compileOutput || '(Compilation errors found — check your code)')
      : '',
    totalTests: testCases.length,
    passedTests,
    status: overallStatus,
    safeMessage,
  };
}

// Preserve existing function signature for backwards compatibility across contestService & answers
export const evaluateCode = evaluateSubmission;

export const judgeService = {
  submitCode,
  checkStatus,
  evaluateSubmission,
  evaluateCode,
};

export default judgeService;

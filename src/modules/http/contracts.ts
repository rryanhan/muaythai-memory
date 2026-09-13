import { ZodError, type ZodType } from "zod";

type ContractIssues = ZodError["issues"];

export class RequestContractError extends Error {
  readonly issues?: ContractIssues;

  constructor(message: string, options: { cause: unknown; issues?: ContractIssues }) {
    super(message, { cause: options.cause });
    this.name = "RequestContractError";
    this.issues = options.issues;
  }
}

export class ResponseContractError extends Error {
  readonly issues: ContractIssues;

  constructor(error: ZodError) {
    super("The server response did not match its contract.", { cause: error });
    this.name = "ResponseContractError";
    this.issues = error.issues;
  }
}

export async function parseJsonRequest<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new RequestContractError("Request body must be valid JSON.", { cause: error });
    }
    throw error;
  }

  return parseRequestValue(schema, body);
}

export async function parseFormDataRequest(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new RequestContractError("Request body must be valid form data.", { cause: error });
    }
    throw error;
  }
}

export function parseRequestValue<T>(schema: ZodType<T>, value: unknown): T {
  return parseRequestContract(() => schema.parse(value));
}

export function parseRequestContract<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ZodError) {
      throw new RequestContractError("Request data did not match its contract.", {
        cause: error,
        issues: error.issues,
      });
    }
    throw error;
  }
}

export function parseResponseContract<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) throw new ResponseContractError(error);
    throw error;
  }
}

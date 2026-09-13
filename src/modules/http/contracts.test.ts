import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseFormDataRequest,
  parseJsonRequest,
  parseRequestContract,
  parseRequestValue,
  parseResponseContract,
  RequestContractError,
  ResponseContractError,
} from "./contracts";

const valueSchema = z.object({ value: z.string().min(1) });

describe("HTTP contract boundaries", () => {
  it("parses a valid JSON request", async () => {
    const request = jsonRequest(JSON.stringify({ value: "valid" }));

    await expect(parseJsonRequest(request, valueSchema)).resolves.toEqual({ value: "valid" });
  });

  it("marks malformed JSON as a request contract error", async () => {
    const request = jsonRequest('{"value":');

    await expect(parseJsonRequest(request, valueSchema)).rejects.toMatchObject({
      name: "RequestContractError",
      issues: undefined,
    });
  });

  it("marks schema-invalid JSON as a request contract error with issues", async () => {
    const request = jsonRequest(JSON.stringify({ value: "" }));

    const error = await parseJsonRequest(request, valueSchema).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(RequestContractError);
    expect(error).toMatchObject({ issues: expect.any(Array) });
  });

  it("marks malformed form data as a request contract error", async () => {
    const request = {
      formData: async () => {
        throw new TypeError("invalid multipart body");
      },
    } as unknown as Request;

    await expect(parseFormDataRequest(request)).rejects.toBeInstanceOf(RequestContractError);
  });

  it("marks invalid path, query, or header values as request contract errors", () => {
    expect(() => parseRequestValue(z.string().uuid(), "not-a-uuid"))
      .toThrow(RequestContractError);
  });

  it("marks invalid server output as a response contract error", () => {
    expect(() => parseResponseContract(valueSchema, { value: 42 }))
      .toThrow(ResponseContractError);
  });

  it("does not relabel non-Zod failures from request or response parsing", () => {
    const requestFailure = new Error("request parser failed");
    const responseFailure = new Error("response transform failed");
    const throwingResponseSchema = z.unknown().transform(() => {
      throw responseFailure;
    });

    expect(() => parseRequestContract(() => {
      throw requestFailure;
    })).toThrow(requestFailure);
    expect(() => parseResponseContract(throwingResponseSchema, null)).toThrow(responseFailure);
  });

  it("does not relabel non-TypeError failures from form data parsing", async () => {
    const failure = new Error("form data parser failed");
    const request = {
      formData: async () => {
        throw failure;
      },
    } as unknown as Request;

    await expect(parseFormDataRequest(request)).rejects.toBe(failure);
  });
});

function jsonRequest(body: string): Request {
  return new Request("https://example.test/api/example", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

/**
 * Result<T, E> — no throwing across layers.
 * Only repositories throw (HTTP errors); services catch and convert to Result.
 */
export interface ResultError {
  code: string;
  message: string;
}

export class Result<T, E extends ResultError = ResultError> {
  private readonly ok: boolean;
  private readonly value: T | undefined;
  private readonly error: E | undefined;

  private constructor(ok: boolean, value: T | undefined, error: E | undefined) {
    this.ok = ok;
    this.value = value;
    this.error = error;
  }

  static success<T, E extends ResultError = ResultError>(value: T): Result<T, E> {
    return new Result<T, E>(true, value, undefined);
  }

  static failure<T, E extends ResultError = ResultError>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  isOk(): boolean {
    return this.ok;
  }

  isError(): boolean {
    return !this.ok;
  }

  getValue(): T {
    if (!this.ok) {
      throw new Error('Cannot read the value of a failed Result');
    }
    return this.value as T;
  }

  getError(): E {
    if (this.ok) {
      throw new Error('Cannot read the error of a successful Result');
    }
    return this.error as E;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return this.ok ? Result.success<U, E>(fn(this.value as T)) : Result.failure<U, E>(this.error as E);
  }

  mapError<F extends ResultError>(fn: (error: E) => F): Result<T, F> {
    return this.ok ? Result.success<T, F>(this.value as T) : Result.failure<T, F>(fn(this.error as E));
  }

  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return this.ok ? fn(this.value as T) : Result.failure<U, E>(this.error as E);
  }

  match<U>(handlers: { ok: (value: T) => U; error: (error: E) => U }): U {
    return this.ok ? handlers.ok(this.value as T) : handlers.error(this.error as E);
  }
}

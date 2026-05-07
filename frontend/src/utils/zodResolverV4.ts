/**
 * Custom zodResolver compatible with Zod v4.
 *
 * The built-in @hookform/resolvers/zod v3.3.4 checks `error.errors` to detect
 * ZodError, but Zod v4 removed `.errors` (only `.issues` exists). This causes
 * the resolver to throw instead of returning field errors — react-hook-form then
 * sets isValid=false but never populates the errors object.
 *
 * This resolver uses safeParse + .issues to work with Zod v4.
 */
import type { FieldError, FieldErrors } from 'react-hook-form';
import { toNestErrors } from '@hookform/resolvers';
import type { z } from 'zod';

interface ZodIssueV4 {
  path: (string | number)[];
  code: string;
  message: string;
  [key: string]: unknown;
}

const parseErrorSchema = (
  issues: ZodIssueV4[],
): Record<string, FieldError> => {
  const errors: Record<string, FieldError> = {};
  for (const issue of issues) {
    const { code, message, path } = issue;
    const _path = path.join('.');
    if (!errors[_path]) {
      errors[_path] = { message, type: code };
    }
  }
  return errors;
};

export const zodResolverV4 = <T extends z.ZodType>(schema: T) => {
  return async (values: unknown, _context: unknown, options: any): Promise<{ values: any; errors: FieldErrors }> => {
    const result = await schema.safeParseAsync(values);

    if (result.success) {
      return { errors: {} as FieldErrors, values: result.data };
    }

    return {
      values: {},
      errors: toNestErrors(
        parseErrorSchema(result.error!.issues as ZodIssueV4[]),
        options,
      ),
    };
  };
};

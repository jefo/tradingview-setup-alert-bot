import 'jest';
import '@types/jest';
import '@types/supertest';

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveBeenCalledWith(expected: any): R;
      toBe(expected: any): R;
      toHaveProperty(property: string, value?: any): R;
    }
  }
}

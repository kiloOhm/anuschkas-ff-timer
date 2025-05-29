export async function executeWithMinDuration<T>(
  fn: () => Promise<T>,
  minDuration: number
): Promise<T> {
  const startTime = Date.now();
  const result = await fn();
  const elapsedTime = Date.now() - startTime;

  if (elapsedTime < minDuration) {
    await new Promise(resolve => setTimeout(resolve, minDuration - elapsedTime));
  }

  return result;
}
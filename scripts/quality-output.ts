/** CLI host boundary; gate execution receives this output port explicitly. */
export const qualityOutput = (stream: "stdout" | "stderr", text: string): void => {
  if (stream === "stdout") process.stdout.write(text)
  else process.stderr.write(text)
}

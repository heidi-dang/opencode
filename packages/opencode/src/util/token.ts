export namespace Token {
  const CHARS_PER_TOKEN = 4

  export function estimate(input: string) {
    return Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN))
  }

  export function estimateMessages(messages: any[]) {
    return messages.reduce((acc, msg) => {
      if (typeof msg.content === "string") return acc + estimate(msg.content)
      if (Array.isArray(msg.content)) {
        return (
          acc +
          msg.content.reduce((pAcc: number, part: any) => {
            if (part.type === "text") return pAcc + estimate(part.text)
            if (part.type === "image") return pAcc + 1000
            return pAcc
          }, 0)
        )
      }
      return acc
    }, 0)
  }
}

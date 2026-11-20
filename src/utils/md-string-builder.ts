export class MdStringBuilder {
  private parts: string[] = [];
  private specialChars = /([_*[\]()~`>#+=|{}.!\-\\])/g;

  constructor() {}

  private escape(text: string): string {
    return text.replace(this.specialChars, '\\$1');
  }

  private escapeExceptParens(text: string): string {
    return text.replace(/([_*[\]~`>#+=|{}.!\-])/g, '\\$1');
  }

  private escapeExceptDash(text: string): string {
    return text.replace(/([_*[\]()~`>#+=|{}.!])/g, '\\$1');
  }

  append(text: string): MdStringBuilder {
    this.parts.push(this.escape(text));
    return this;
  }

  appendRaw(text: string): MdStringBuilder {
    this.parts.push(text);
    return this;
  }

  appendLine(text: string = ''): MdStringBuilder {
    return this.append(text).appendRaw('\n');
  }

  separator(length: number = 20): MdStringBuilder {
    return this.appendRaw('\\-'.repeat(length)).appendRaw('\n');
  }

  hashtag(tag: string): MdStringBuilder {
    // Remove leading # if present
    tag = tag.replace(/^#/, '');
    // Ensure only valid characters are used
    if (!/^[a-zA-Z0-9_]+$/.test(tag)) {
      throw new Error('Hashtag can only contain letters, numbers and underscore');
    }
    this.appendRaw(`\\#${tag}`);
    return this;
  }

  bold(text: string): MdStringBuilder {
    return this.appendRaw(`*${this.escape(text)}*`);
  }

  italic(text: string): MdStringBuilder {
    return this.appendRaw(`_${this.escape(text)}_`);
  }

  code(text: string): MdStringBuilder {
    return this.appendRaw(`\`${this.escape(text)}\``);
  }

  bullet(text: string): MdStringBuilder {
    // Special handling for price ranges
    const priceRangeRegex = /(@\d+,\d+\-\d+,\d+)/;
    const match = text.match(priceRangeRegex);
    if (match) {
      const [priceRange] = match;
      const [beforePrice, afterPrice] = text.split(priceRange);
      return this.appendRaw('• ')
        .append(beforePrice)
        .appendRaw(priceRange.replace(/\-/g, '-'))
        .append(afterPrice)
        .appendRaw('\n');
    }
    return this.appendRaw('• ').append(text).appendRaw('\n');
  }

  priceRange(text: string): MdStringBuilder {
    this.parts.push(this.escapeExceptDash(text));
    return this;
  }

  appendReason(text: string): MdStringBuilder {
    this.parts.push(this.escapeExceptParens(text));
    return this;
  }

  toString(): string {
    return this.parts.join('');
  }

  clear(): void {
    this.parts = [];
  }
}

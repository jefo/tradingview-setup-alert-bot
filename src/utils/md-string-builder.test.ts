import { beforeEach, describe, expect, it } from 'bun:test';
import { MdStringBuilder } from './md-string-builder';

describe('MdStringBuilder', () => {
  let builder: MdStringBuilder;

  beforeEach(() => {
    builder = new MdStringBuilder();
  });

  it('should escape special characters', () => {
    const result = builder
      .append('Hello_World*[Test]')
      .toString();
    expect(result).toBe('Hello\\_World\\*\\[Test\\]');
  });

  it('should handle line breaks correctly', () => {
    const result = builder
      .appendLine('First line')
      .appendLine('Second line')
      .toString();
    expect(result).toBe('First line\nSecond line\n');
  });

  it('should create proper separators', () => {
    const result = builder
      .separator(3)
      .toString();
    expect(result).toBe('\\-\\-\\-\n');
  });

  it('should format hashtags correctly', () => {
    const result = builder
      .hashtag('test')
      .append(' ')
      .hashtag('#another_test')
      .toString();
    expect(result).toBe('\\#test \\#another_test');
  });

  it('should throw error for invalid hashtags', () => {
    expect(() => {
      builder.hashtag('invalid-tag');
    }).toThrow('Hashtag can only contain letters, numbers and underscore');
  });

  it('should format bold text correctly', () => {
    const result = builder
      .bold('Important*Text')
      .toString();
    expect(result).toBe('*Important\\*Text*');
  });

  it('should format italic text correctly', () => {
    const result = builder
      .italic('Emphasized_Text')
      .toString();
    expect(result).toBe('_Emphasized\\_Text_');
  });

  it('should format code correctly', () => {
    const result = builder
      .code('console.log("Hello")')
      .toString();
    expect(result).toBe('`console\\.log\\("Hello"\\)`');
  });

  it('should create bullet points correctly', () => {
    const result = builder
      .bullet('First item')
      .bullet('Second*item')
      .toString();
    expect(result).toBe('• First item\n• Second\\*item\n');
  });

  it('should handle complex message formatting', () => {
    const result = builder
      .appendLine('BTCUSDT Market Structure')
      .appendLine('13:41 UTC')
      .appendLine()
      .appendLine('1H TIMEFRAME')
      .appendLine()
      .separator(3)
      .appendLine('STRUCTURE:')
      .bullet('Internal bullish BOS @39,600')
      .bullet('Internal bearish BOS @39,450')
      .appendLine()
      .hashtag('btcusdt')
      .append(' ')
      .hashtag('status')
      .toString();

    expect(result).toBe(
      'BTCUSDT Market Structure\n' +
      '13:41 UTC\n' +
      '\n' +
      '1H TIMEFRAME\n' +
      '\n' +
      '\\-\\-\\-\n' +
      'STRUCTURE:\n' +
      '• Internal bullish BOS @39,600\n' +
      '• Internal bearish BOS @39,450\n' +
      '\n' +
      '\\#btcusdt \\#status'
    );
  });

  it('should handle clear operation', () => {
    builder
      .append('Some text')
      .clear();
    expect(builder.toString()).toBe('');
  });

  it('should handle clear operation', () => {
    const builder = new MdStringBuilder();
    builder.append('test');
    builder.clear();
    expect(builder.toString()).toBe('');
  });

  it('should format price ranges correctly', () => {
    const builder = new MdStringBuilder();
    builder.priceRange('39,400-39,500');
    expect(builder.toString()).toBe('39,400-39,500');

    builder.clear();
    builder.priceRange('39,400-39,500 [H4]');
    expect(builder.toString()).toBe('39,400-39,500 \\[H4\\]');
  });
});

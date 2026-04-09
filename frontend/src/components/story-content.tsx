import * as React from "react";

const RUBY_RE =
  /([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef·]+)\(([a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùüÜǖǘǚǜɑ\s·\d]+)\)/g;

const CJK = /[\u4e00-\u9fff]/;

function splitPinyinSyllables(pinyin: string): string[] {
  return pinyin
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** When syllable count matches Han character count, one rt per character; else one rt for the whole group. */
function RubyHanziPinyin({
  hanzi,
  pinyin,
  keyPrefix,
}: {
  hanzi: string;
  pinyin: string;
  keyPrefix: string;
}) {
  const syllables = splitPinyinSyllables(pinyin);
  const chars = Array.from(hanzi);
  const cjkChars = chars.filter((ch) => CJK.test(ch));

  if (cjkChars.length === syllables.length && cjkChars.length > 0) {
    let syl = 0;
    return (
      <>
        {chars.map((ch, idx) => {
          if (CJK.test(ch)) {
            const rt = syllables[syl];
            syl += 1;
            return (
              <ruby
                key={`${keyPrefix}-c-${idx}`}
                className="ruby-char align-bottom"
              >
                {ch}
                <rt className="ruby-pinyin-text">{rt}</rt>
              </ruby>
            );
          }
          return (
            <span key={`${keyPrefix}-sym-${idx}`} className="ruby-non-cjk">
              {ch}
            </span>
          );
        })}
      </>
    );
  }

  return (
    <ruby key={`${keyPrefix}-fb`} className="ruby-word align-bottom">
      {hanzi}
      <rt className="ruby-pinyin-text">{pinyin.trim()}</rt>
    </ruby>
  );
}

function parseRubySegment(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(RUBY_RE.source, RUBY_RE.flags);
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(
        <React.Fragment key={`${keyPrefix}-t-${i++}`}>
          {text.slice(last, m.index)}
        </React.Fragment>
      );
    }
    const rubyKey = `${keyPrefix}-r-${i++}`;
    nodes.push(
      <RubyHanziPinyin
        key={rubyKey}
        keyPrefix={rubyKey}
        hanzi={m[1]}
        pinyin={m[2]}
      />
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(
      <React.Fragment key={`${keyPrefix}-t-${i++}`}>
        {text.slice(last)}
      </React.Fragment>
    );
  }
  return nodes.length ? nodes : [text];
}

function parseBoldAndRuby(
  content: string,
  baseKey: string
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const boldRe = /\*\*([\s\S]+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let bi = 0;
  while ((m = boldRe.exec(content)) !== null) {
    if (m.index > last) {
      const plain = content.slice(last, m.index);
      out.push(
        <React.Fragment key={`${baseKey}-p-${bi}`}>
          {parseRubySegment(plain, `${baseKey}-p-${bi}`)}
        </React.Fragment>
      );
      bi++;
    }
    out.push(
      <strong
        key={`${baseKey}-b-${bi}`}
        className="font-semibold text-primary"
      >
        {parseRubySegment(m[1], `${baseKey}-b-${bi}`)}
      </strong>
    );
    bi++;
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    out.push(
      <React.Fragment key={`${baseKey}-p-${bi}`}>
        {parseRubySegment(content.slice(last), `${baseKey}-tail`)}
      </React.Fragment>
    );
  }
  return out.length ? out : parseRubySegment(content, baseKey);
}

function ParagraphBlock({
  text,
  index,
  pinyinMode,
}: {
  text: string;
  index: number;
  pinyinMode: boolean;
}) {
  const lines = text.split("\n");
  return (
    <p
      className={
        pinyinMode
          ? "story-paragraph-pinyin mb-5 text-[1.06rem] text-foreground/95 last:mb-0"
          : "mb-4 text-[1.05rem] leading-[1.85] text-foreground/95 last:mb-0"
      }
    >
      {lines.map((line, j) => (
        <React.Fragment key={j}>
          {j > 0 && <br />}
          {parseBoldAndRuby(line, `para-${index}-L${j}`)}
        </React.Fragment>
      ))}
    </p>
  );
}

export function StoryBody({
  content,
  className,
  pinyinMode = false,
}: {
  content: string;
  className?: string;
  /** Wider line height & letter spacing when story includes pinyin */
  pinyinMode?: boolean;
}) {
  const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  return (
    <div className={className}>
      {paragraphs.map((para, i) => (
        <ParagraphBlock
          key={i}
          index={i}
          text={para.trim()}
          pinyinMode={pinyinMode}
        />
      ))}
    </div>
  );
}

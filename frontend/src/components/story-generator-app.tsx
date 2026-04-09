"use client";

import * as React from "react";
import {
  AlertCircle,
  BookOpen,
  Clock,
  Download,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";

import { generateStory } from "@/lib/api";
import type { StoryResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StoryBody } from "@/components/story-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

const GRADES = [
  { value: "P1", label: "P1 · 一年級" },
  { value: "P2", label: "P2 · 二年級" },
  { value: "P3", label: "P3 · 三年級" },
  { value: "P4", label: "P4 · 四年級" },
  { value: "P5", label: "P5 · 五年級" },
  { value: "P6", label: "P6 · 六年級" },
] as const;

function buildDownloadText(story: StoryResponse): string {
  const lines: string[] = [story.title, "", story.content, ""];
  if (story.vocabulary_list.length) {
    lines.push("詞彙 Vocabulary", "");
    for (const v of story.vocabulary_list) {
      const p = v.pinyin ? ` (${v.pinyin})` : "";
      lines.push(`• ${v.word}${p} — ${v.meaning}`);
    }
    lines.push("");
  }
  if (story.questions.length) {
    lines.push("閱讀理解問題", "");
    story.questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  }
  return lines.join("\n");
}

export function StoryGeneratorApp() {
  const [grade, setGrade] = React.useState("P3");
  const [theme, setTheme] = React.useState("");
  const [vocabFocus, setVocabFocus] = React.useState("");
  const [difficulty, setDifficulty] = React.useState([3]);
  const [includePinyin, setIncludePinyin] = React.useState(true);
  const [includeQuestions, setIncludeQuestions] = React.useState(true);
  const [concise, setConcise] = React.useState(true);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [story, setStory] = React.useState<StoryResponse | null>(null);
  /** 從發起到收到 HTTP 回應本體（含 JSON 解析前由 fetch 完成） */
  const [apiMs, setApiMs] = React.useState<number | null>(null);
  /** 從收到資料到 React 完成本次 DOM 更新（useLayoutEffect ≈ commit 後） */
  const [renderMs, setRenderMs] = React.useState<number | null>(null);
  const afterApiMarkRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    if (!story || afterApiMarkRef.current === null) return;
    const start = afterApiMarkRef.current;
    afterApiMarkRef.current = null;
    setRenderMs(performance.now() - start);
  }, [story]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setApiMs(null);
    setRenderMs(null);
    afterApiMarkRef.current = null;
    setLoading(true);
    setStory(null);
    const t0 = performance.now();
    try {
      const d = difficulty[0] ?? 3;
      const res = await generateStory({
        grade,
        theme,
        vocab_focus: vocabFocus,
        difficulty: d,
        include_pinyin: includePinyin,
        include_questions: includeQuestions,
        concise,
      });
      const t1 = performance.now();
      setApiMs(t1 - t0);
      afterApiMarkRef.current = t1;
      setStory(res);
    } catch (err) {
      setApiMs(performance.now() - t0);
      setRenderMs(null);
      setError(err instanceof Error ? err.message : "生成失敗");
    } finally {
      setLoading(false);
    }
  }

  function downloadTxt() {
    if (!story) return;
    const blob = new Blob([buildDownloadText(story)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = story.title.replace(/[^\w\u4e00-\u9fff]+/g, "_").slice(0, 40);
    a.download = `${safe || "story"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const diffLabel = difficulty[0] ?? 3;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-br from-background via-background to-primary/[0.04] lg:flex-row">
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col border-b border-sidebar-border bg-sidebar/90 backdrop-blur-sm lg:w-[min(100%,22rem)] lg:border-r lg:border-b-0 xl:w-96"
        )}
      >
        <div className="border-b border-sidebar-border/80 px-5 py-5">
          <div className="flex items-center gap-2 text-sidebar-foreground">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="size-5" aria-hidden />
            </span>
            <div>
              <h1 className="font-heading text-lg font-semibold tracking-tight">
                中文故事生成器
              </h1>
              <p className="text-xs text-muted-foreground">
                ISF Academy · 弘立書院
              </p>
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <form onSubmit={onSubmit} className="space-y-5 px-5 py-5">
            <div className="space-y-2">
              <Label htmlFor="grade">年級 Grade</Label>
              <Select
                value={grade}
                onValueChange={(v) => {
                  if (v) setGrade(v);
                }}
              >
                <SelectTrigger
                  id="grade"
                  size="default"
                  className="w-full min-w-0 border-input bg-card/80"
                >
                  <SelectValue placeholder="選擇年級" />
                </SelectTrigger>
                <SelectContent>
                  {GRADES.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme">主題 Theme</Label>
              <Input
                id="theme"
                placeholder="例如：春節、友誼、學校生活…"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="bg-card/80"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vocab">詞彙重點 Vocab focus</Label>
              <Input
                id="vocab"
                placeholder="希望出現的詞語或句式（可選）"
                value={vocabFocus}
                onChange={(e) => setVocabFocus(e.target.value)}
                className="bg-card/80"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="difficulty">難度 Difficulty</Label>
                <span
                  id="difficulty-value"
                  className="text-sm font-medium tabular-nums text-primary"
                >
                  {diffLabel} / 5
                </span>
              </div>
              <Slider
                id="difficulty"
                min={1}
                max={5}
                step={1}
                value={difficulty}
                onValueChange={(v) =>
                  setDifficulty(
                    typeof v === "number" ? [v] : Array.from(v as readonly number[])
                  )
                }
                aria-labelledby="difficulty-value"
                className="py-1"
              />
              <p className="text-xs text-muted-foreground">
                  1 最易 · 5 最具挑戰
              </p>
            </div>

            <Separator className="bg-border/80" />

            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="pinyin"
                  checked={includePinyin}
                  onCheckedChange={(v) => setIncludePinyin(v === true)}
                />
                <Label htmlFor="pinyin" className="font-normal leading-snug">
                  包含拼音（注音樣式）
                </Label>
              </div>
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="questions"
                  checked={includeQuestions}
                  onCheckedChange={(v) => setIncludeQuestions(v === true)}
                />
                <Label htmlFor="questions" className="font-normal leading-snug">
                  包含閱讀理解問題
                </Label>
              </div>
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="concise"
                  checked={concise}
                  onCheckedChange={(v) => setConcise(v === true)}
                />
                <Label htmlFor="concise" className="font-normal leading-snug">
                  快速模式（較短故事，通常更快）
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    減少模型輸出字數，可明顯縮短等待時間
                  </span>
                </Label>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="h-12 w-full gap-2 rounded-xl text-base font-semibold shadow-md transition-shadow hover:shadow-lg"
            >
              {loading ? (
                <>
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                  生成中
                </>
              ) : (
                <>
                  <Sparkles className="size-5" aria-hidden />
                  生成故事
                </>
              )}
            </Button>
          </form>
        </ScrollArea>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border/80 bg-card/40 px-4 py-3 backdrop-blur-sm md:px-6">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">閱讀區</span>
            — 生成后在此顯示故事、詞彙與問題。適合課堂投影與打印。
          </p>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
            {error && (
              <Alert variant="destructive" className="mb-6 border-destructive/40">
                <AlertCircle className="size-4" />
                <AlertTitle>無法生成</AlertTitle>
                <AlertDescription>
                  {error}
                  {apiMs != null && (
                    <span className="mt-2 block font-mono text-xs tabular-nums opacity-90">
                      本次請求耗時 API {apiMs.toFixed(0)} ms
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {loading && (
              <div
                className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="size-12 animate-spin text-primary" />
                <p className="text-center text-sm">
                  正在創作故事，請稍候
                </p>
              </div>
            )}

            {!loading && !story && !error && (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/80 bg-card/30 px-6 py-20 text-center">
                <div className="rounded-full bg-primary/10 p-4 text-primary">
                  <Wand2 className="size-10" aria-hidden />
                </div>
                <div className="space-y-1">
                  <p className="font-heading text-lg font-semibold text-foreground">
                    準備好開始了嗎？
                  </p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    在左側填寫年級、主題與選項，點擊「生成故事」。後端需運行在{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      localhost:8000
                    </code>
                    。
                  </p>
                </div>
              </div>
            )}

            {story && !loading && (
              <article className="space-y-8">
                <header className="space-y-2">
                  <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                    {story.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {story.pinyin_enabled && (
                      <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-secondary-foreground">
                        包含拼音
                      </span>
                    )}
                    {!story.pinyin_enabled && (
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        純中文正文
                      </span>
                    )}
                    {(apiMs != null || renderMs != null) && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 font-mono tabular-nums text-foreground/90"
                        title="API：網路請求至收到回應。畫面更新：收到資料後至 React 完成 DOM 更新（不含瀏覽器繪製像素）。"
                      >
                        <Clock className="size-3.5 shrink-0 opacity-70" aria-hidden />
                        {apiMs != null && (
                          <span>API {apiMs.toFixed(0)} ms</span>
                        )}
                        {apiMs != null && renderMs != null && (
                          <span className="text-muted-foreground">·</span>
                        )}
                        {renderMs != null && (
                          <span>畫面 {renderMs.toFixed(0)} ms</span>
                        )}
                      </span>
                    )}
                  </div>
                </header>

                <Card className="border-border/80 bg-card/90 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-heading text-lg">故事內容</CardTitle>
                    <CardDescription>
                      加粗詞語為重點詞彙；若正文為「漢字(pinyin)」格式，將顯示為注音樣式。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <StoryBody
                      content={story.content}
                      pinyinMode={story.pinyin_enabled}
                    />
                  </CardContent>
                </Card>

                {story.vocabulary_list.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="font-heading text-lg font-semibold">
                      詞彙表 Vocabulary
                    </h3>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {story.vocabulary_list.map((v, i) => (
                        <li
                          key={`${v.word}-${i}`}
                          className="rounded-xl border border-border/60 bg-vocab-highlight/90 px-4 py-3 text-sm shadow-sm"
                        >
                          <span className="text-lg font-semibold text-foreground">
                            {v.word}
                          </span>
                          {v.pinyin && (
                            <span className="ml-2 text-primary/90">
                              {v.pinyin}
                            </span>
                          )}
                          {v.meaning && (
                            <p className="mt-1 text-muted-foreground leading-relaxed">
                              {v.meaning}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {story.questions.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="font-heading text-lg font-semibold">
                      閱讀理解問題
                    </h3>
                    <ol className="list-decimal space-y-3 pl-5 text-[1.05rem] leading-relaxed marker:text-primary">
                      {story.questions.map((q, i) => (
                        <li key={i} className="pl-1">
                          {q}
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="rounded-xl"
                    onClick={downloadTxt}
                  >
                    <Download className="size-4" />
                    下載 TXT
                  </Button>
                </div>
              </article>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

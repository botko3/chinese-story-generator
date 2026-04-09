export type StoryRequest = {
  grade: string;
  theme: string;
  vocab_focus: string;
  difficulty: number;
  include_pinyin: boolean;
  include_questions: boolean;
  /** Shorter story JSON — fewer tokens, usually faster (backend "concise" mode). */
  concise: boolean;
};

export type VocabularyItem = {
  word: string;
  pinyin: string;
  meaning: string;
};

export type StoryResponse = {
  title: string;
  content: string;
  pinyin_enabled: boolean;
  vocabulary_list: VocabularyItem[];
  questions: string[];
};

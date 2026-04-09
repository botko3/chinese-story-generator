export type StoryRequest = {
  grade: string;
  theme: string;
  vocab_focus: string;
  difficulty: number;
  include_pinyin: boolean;
  include_questions: boolean;
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

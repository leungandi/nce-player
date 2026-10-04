/** 一课里的一个句子。`start`/`end` 是它在音频中的真实边界。 */
export type LessonLine = {
	/** 句序，从 0 开始 */
	i: number;
	start: number;
	end: number;
	en: string;
	zh?: string;
	/** 本句涉及的词（词形还原后），供生词本与复习使用 */
	words?: string[];
};

/** 一个词条，全课去重后放在 `words` 里。 */
export type LessonWord = {
	w: string;
	lemma: string;
	pos?: string;
	phonetic?: string;
	zh?: string;
	pattern?: string;
	level?: string;
};

/** 语法或用法注释，挂在某个句子上。 */
export type LessonNote = {
	line: number;
	type: 'grammar' | 'usage' | 'culture';
	title: string;
	body: string;
};

export type Lesson = {
	id: string;
	book: string;
	title: string;
	titleZh?: string;
	accent: 'us' | 'uk';
	audio: {
		src: string;
		duration?: number;
	};
	/** 中英对照的可信度：machine 表示机翻初稿，none 表示暂无译文 */
	translation: 'none' | 'machine' | 'reviewed';
	/** 句子边界来源：estimated 是按间隔估算，aligned 是强制对齐结果 */
	alignment: 'estimated' | 'aligned';
	lines: LessonLine[];
	words?: LessonWord[];
	notes?: LessonNote[];
};

/** 课本登记项。资源可以来自任意支持 CORS 的静态服务器。 */
export type Book = {
	key: string;
	title: string;
	level?: string;
	path: string;
};

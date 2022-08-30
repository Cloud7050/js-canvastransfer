(() => {
	const QuestionType = {
		BLANKS: "blanks",
		CHOICES: "choices",

		UNKNOWN: "unknown"
	};

	/* eslint-disable camelcase */
	const CLASS_QUESTION_TYPE = {
		fill_in_multiple_blanks_question: QuestionType.BLANKS,
		short_answer_question: QuestionType.BLANKS,
		multiple_answers_question: QuestionType.CHOICES,
		multiple_choice_question: QuestionType.CHOICES,
		true_false_question: QuestionType.CHOICES
	};
	/* eslint-enable camelcase */

	// Eg question_26789
	const REGEX_QUESTION_ID = /^question_(?<id>\d+)$/u;
	// Eg answer-7050 for results, or question_26789_answer_7050 for ongoing
	const REGEX_ANSWER_ID = /^(?:question_\d+_)?answer[-_](?<id>\d+)$/u;
	const REGEX_MARKS = /^(?<actualMarks>\d+(?:\.\d+)?) \/ (?<maxMarks>\d+(?:\.\d+)?) pts$/u;

	const LOCAL_STORAGE_KEY = "CanvasTransfer";



	class QuestionInfo {
		constructor(
			id,
			type,
			answerInfos,
			element,
			actualMarks,
			maxMarks
		) {
			Object.assign(
				this,
				{
					id,
					type,
					// Processing must return all answer elements to faciliate importing
					answerInfos,
					element,
					actualMarks,
					maxMarks
				}
			);
		}

		export() {
			return {
				id: this.id,
				type: this.type,
				answerInfos: this.answerInfos.map((answerInfo) => answerInfo.export()),
				actualMarks: this.actualMarks,
				maxMarks: this.maxMarks
			};
		}
	}

	class AnswerInfo {
		constructor(element) {
			Object.assign(
				this,
				{ element }
			);
		}
	}

	class BlanksAnswerInfo extends AnswerInfo {
		constructor(
			input,
			text
		) {
			super(
				input
			);
			Object.assign(
				this,
				{ text }
			);
		}

		export() {
			return {
				text: this.text
			};
		}
	}

	class ChoicesAnswerInfo extends AnswerInfo {
		constructor(
			input,
			id,
			checked
		) {
			super(
				input
			);
			Object.assign(
				this,
				{
					id,
					checked
				}
			);
		}

		export() {
			return {
				id: this.id,
				checked: this.checked
			};
		}
	}



	function l(content, group = false) {
		let consoleFunction = (!group) ? console.log : console.group;
		consoleFunction(
			// Skip instanceof check for type object + class String from new String()s
			(typeof content !== "string")
				? content
				: `>>> ${content}`
		);
	}

	function w(content) {
		console.warn(
			(typeof content !== "string")
				? content
				: `[!] ${content}!`
		);
	}

	function e(content) {
		console.error(
			(typeof content !== "string")
				? content
				: `ERR ${content}!`
		);
	}

	function d(content) {
		console.debug(
			(typeof content !== "string")
				? content
				: `*** ${content}`
		);
	}

	function extractRegexId(element, regex) {
		let elementId = element.id;
		if (elementId === "") return -1;

		let result = regex.exec(elementId);
		if (result === null) return -1;

		return parseInt(result.groups.id);
	}

	function removeIfExists(array, element) {
		let index = array.indexOf(element);
		if (index === -1) return false;

		array.splice(index, 1);
		return true;
	}

	function triggerUpdate(element) {
		// Event has to be change event, and must bubble, in order to:
		// • Trigger autosave
		// • Update question list status (eg icons)
		// • Prevent unanswered question alert (if all filled)
		element.dispatchEvent(
			new Event(
				"change",
				{
					bubbles: true
				}
			)
		);
	}



	class QuestionManager {
		cannotProceed = false;

		questionInfos = [];

		constructor(scan) {
			let successCount = 0;
			let questionCount = 0;

			for (let question of scan.questions) {
				questionCount++;
				l(`⚙️ Processing page's Q${questionCount}...`, true);

				// Process question ID
				let questionId = extractRegexId(question, REGEX_QUESTION_ID);
				if (questionId === -1) {
					e("Unable to extract ID from question");
					console.groupEnd();
					continue;
				}

				// Process question type
				let questionType = this.#processQuestionType(question);
				if (questionType === QuestionType.UNKNOWN) {
					e("⚠️ This question type isn't supported");
					// DOMTokenList to array for cleaner formatting
					d([...question.classList]);
					console.groupEnd();
					continue;
				}

				// Process answer infos
				let answerInfos = null;
				switch (questionType) {
					case QuestionType.BLANKS:
						answerInfos = this.#processAnswerBlanks(question);
						break;
					case QuestionType.CHOICES:
						answerInfos = this.#processAnswerChoices(question);
						break;
				}

				if (answerInfos === null) {
					// Rely on processing methods above to give error feedback
					console.groupEnd();
					continue;
				}

				// Process marks, if available
				let actualMarks = -1;
				let maxMarks = -1;
				let marksHolder = question.querySelector("div.user_points");
				if (marksHolder !== null) {
					let marksText = marksHolder.innerText;
					let result = REGEX_MARKS.exec(marksText);
					if (result !== null) {
						actualMarks = parseFloat(result.groups.actualMarks);
						maxMarks = parseFloat(result.groups.maxMarks);
					}
				}

				let questionInfo = new QuestionInfo(
					questionId,
					questionType,
					answerInfos,
					question,
					actualMarks,
					maxMarks
				);
				d(questionInfo);

				this.questionInfos.push(questionInfo);
				successCount++;
				console.groupEnd();
			}

			l(`📦 Processed ${successCount}/${questionCount} questions`);
			d(this.questionInfos);
		}

		#processQuestionType(question) {
			for (let [className, questionType] of Object.entries(CLASS_QUESTION_TYPE)) {
				if (question.classList.contains(className)) return questionType;
			}

			return QuestionType.UNKNOWN;
		}

		#processAnswerBlanks(question) {
			let inputs = question.querySelectorAll("input[type=text]");
			if (inputs.length === 0) {
				e("No inputs found in question");
				return null;
			}

			let answerInfos = [];
			for (let input of inputs) {
				// Process text
				let text = input.value;

				let answerInfo = new BlanksAnswerInfo(
					input,
					text
				);
				answerInfos.push(answerInfo);
			}

			return answerInfos;
		}

		#processAnswerChoices(question) {
			let inputs = question.querySelectorAll("input[type=radio], input[type=checkbox]");
			if (inputs.length === 0) {
				e("No inputs found in question");
				return null;
			}

			let answerInfos = [];
			for (let input of inputs) {
				// Process answer ID
				let answerId = extractRegexId(input, REGEX_ANSWER_ID);
				if (answerId === -1) {
					e("Unable to extract answer ID from input");
					console.groupEnd();
					continue;
				}

				// Process checked status
				let { checked } = input;

				let answerInfo = new ChoicesAnswerInfo(
					input,
					answerId,
					checked
				);
				answerInfos.push(answerInfo);
			}

			return answerInfos;
		}

		store() {
			let data = this.questionInfos.map((questionInfo) => questionInfo.export());
			d(data);
			localStorage.setItem(
				LOCAL_STORAGE_KEY,
				JSON.stringify(data)
			);
		}
	}

	class Scan {
		cannotProceed = false;

		extractorMode = true;
		questions = [];

		constructor() {
			let questionsHolder = document.querySelector("div#questions");
			if (questionsHolder === null) {
				e("Can neither extract nor import (no questions holder found in document)");
				this.cannotProceed = true;
				return;
			}

			if (questionsHolder.classList.contains("assessment_results")) {
				// Quiz results
				l("📈 Using extractor mode");
				this.extractorMode = true;
			} else if (questionsHolder.classList.contains("assessing")) {
				// Ongoing attempt
				l("🪄 Using importer mode");
				this.extractorMode = false;
			} else {
				e("Can neither extract nor import (unknown kind of questions holder)");
				this.cannotProceed = true;
				return;
			}

			let questionSelector = "div.question";
			// NodeList to array for array methods
			this.questions = [...questionsHolder.querySelectorAll(questionSelector)];

			// A question may be nested within another question as text. Remove any such nested
			// questions.
			// Make a copy as elements may be removed from any point of this.questions
			let questionsToCheck = [...this.questions];
			while (questionsToCheck.length > 0) {
				let questionToCheck = questionsToCheck.shift();

				let nestedQuestions = questionToCheck.querySelectorAll(questionSelector);
				for (let nestedQuestion of nestedQuestions) {
					removeIfExists(this.questions, nestedQuestion);

					// For efficiency, don't check inside removed question if it has yet to be
					// checked
					removeIfExists(questionsToCheck, nestedQuestion);
				}
			}
		}

		process() {
			return new QuestionManager(this);
		}
	}

	class StoredData {
		#questionInfos = [];

		cannotProceed = false;

		data = null;

		constructor(questionManager) {
			// Clone for #importOne() to progressively remove overwritten questions
			this.#questionInfos = [...questionManager.questionInfos];

			let rawData = localStorage.getItem(LOCAL_STORAGE_KEY);
			if (rawData === null) {
				e("⛔ Did not find any stored answers to retrieve. Run this script on your quiz results (not an ongoing attempt) to extract those answers first");
				this.cannotProceed = true;
				return;
			}

			try {
				this.data = JSON.parse(rawData);
			} catch (syntaxError) {
				e("Stored data unreadable");
				e(syntaxError);
				this.cannotProceed = true;
				return;
			}

			l("✨ Stored answers retrieved");
			d(this.data);
		}

		import() {
			let successCount = 0;
			let dataCount = 0;

			for (let questionData of this.data) {
				dataCount++;
				l(`🔮 Importing stored answer data #${dataCount}...`, true);

				try {
					let success = this.#importOne(questionData);
					if (success) successCount++;
				} catch (error) {
					e("⛔ Your stored answer is in a different format. You may be running a newer version of the script on outdated data - try re-extracting your answers");
					e(error);
					console.groupEnd();
					continue;
				}

				console.groupEnd();
			}

			l(`☁️ Imported ${successCount}/${dataCount} answer data`);
		}

		// Question data is from storage with answers, question info is fresh from page with
		// elements
		#importOne(questionData) {
			let index = this.#questionInfos.findIndex(
				(questionInfo) => questionInfo.id === questionData.id
			);
			if (index === -1) {
				e("⚠️ Your stored answer doesn't match any of this quiz's processed questions");
				return false;
			}
			let questionInfo = this.#questionInfos[index];

			switch (questionData.type) {
				case QuestionType.BLANKS:
					this.#importAnswerBlanks(questionInfo, questionData);
					break;
				case QuestionType.CHOICES:
					this.#importAnswerChoices(questionInfo, questionData);
					break;
				default:
					e("Stored question type not supported");
					return false;
			}

			this.#highlightQuestion(questionInfo, questionData);

			this.#questionInfos.splice(index, 1);
			return true;
		}

		#importAnswerBlanks(questionInfo, questionData) {
			// Assumption: Stored answer data count matches that of QuestionInfo#AnswerInfo
			for (let i = 0; i < questionInfo.answerInfos.length; i++) {
				let blanksAnswerInfo = questionInfo.answerInfos[i];
				let blanksAnswerData = questionData.answerInfos[i];

				blanksAnswerInfo.element.value = blanksAnswerData.text;
				triggerUpdate(blanksAnswerInfo.element);
			}
		}

		#importAnswerChoices(questionInfo, questionData) {
			// Clone for removing imported answer data
			let choicesAnswerDatas = [...questionData.answerInfos];

			for (let choicesAnswerInfo of questionInfo.answerInfos) {
				// For each element, try to find data of the same answer ID. If found, overwrite
				// checked status (be it checking or unchecking)
				let index = choicesAnswerDatas.findIndex(
					(answerData) => answerData.id === choicesAnswerInfo.id
				);
				if (index === -1) {
					e("Answer info is missing corresponding answer data");
					continue;
				}
				let choicesAnswerData = choicesAnswerDatas[index];

				choicesAnswerInfo.element.checked = choicesAnswerData.checked;
				triggerUpdate(choicesAnswerInfo.element);

				choicesAnswerDatas.splice(index, 1);
			}
		}

		#highlightQuestion(questionInfo, questionData) {
			if (questionData.maxMarks === -1) return;

			let header = questionInfo.element.querySelector("div.header");
			if (header === null) {
				w("No header found in question");
				return;
			}

			let pointsHolder = header.querySelector("span.question_points_holder");
			if (pointsHolder === null) {
				w("No points holder found in header");
				return;
			}

			let isFullMarks = questionData.actualMarks === questionData.maxMarks;
			let rgb = (isFullMarks)
				? "85 255 170" // Greenish blue
				: "255 170 0"; // Orange

			header.style["background-color"] = `rgb(${rgb} / 20%)`;

			pointsHolder.textContent = `☁️ ${questionData.actualMarks} / ${questionData.maxMarks} pts`;
		}
	}



	let scan = new Scan();
	if (scan.cannotProceed) return;

	let questionManager = scan.process();
	if (questionManager.cannotProceed) return;

	if (scan.extractorMode) {
		questionManager.store();
		l("✅ Your answers have been extracted & stored. Run this script again on an ongoing quiz attempt to import them");
	} else {
		let storedData = new StoredData(questionManager);
		if (storedData.cannotProceed) return;

		storedData.import();
		l("✅ Your answers have been retrieved & imported. Matching questions have been overwritten");
	}
})();

(() => {
	const QuestionType = {
		CHOICES: "choices",

		UNKNOWN: "unknown"
	};

	/* eslint-disable camelcase */
	const CLASS_QUESTION_TYPE = {
		true_false_question: QuestionType.CHOICES
	};
	/* eslint-enable camelcase */

	// Eg question_26789
	const REGEX_QUESTION_ID = /^question_(?<id>\d+)$/u;
	// Eg answer-7050 for results, or question_26789_answer_7050 for ongoing
	const REGEX_ANSWER_ID = /^(?:question_\d+_)?answer[-_](?<id>\d+)$/u;

	const LOCAL_STORAGE_KEY = "CanvasTransfer";



	class QuestionInfo {
		constructor(
			id,
			type,
			answerInfos
		) {
			Object.assign(
				this,
				{
					id,
					type,
					// Processing must return all answer elements to faciliate importing
					answerInfos
				}
			);
		}

		export() {
			return {
				id: this.id,
				type: this.type,
				answerInfos: this.answerInfos.map((answerInfo) => answerInfo.export())
			};
		}
	}

	class AnswerInfo {
		constructor(
			id,
			element
		) {
			Object.assign(
				this,
				{
					id,
					element
				}
			);
		}

		export() {
			return {
				id: this.id
			};
		}
	}

	class ChoicesAnswerInfo extends AnswerInfo {
		constructor(
			id,
			element,

			checked
		) {
			super(
				id,
				element
			);

			Object.assign(
				this,
				{ checked }
			);
		}

		export() {
			return {
				...super.export(),

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

	function removeIfExists(array, element) {
		let index = array.indexOf(element);
		if (index === -1) return false;

		array.splice(index, 1);
		return true;
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
				let elementId = question.id;
				if (elementId === "") {
					e("Question has no element ID");
					console.groupEnd();
					continue;
				}

				let result = REGEX_QUESTION_ID.exec(elementId);
				if (result === null) {
					e("Unrecognised element ID format for question");
					console.groupEnd();
					continue;
				}

				let questionId = parseInt(result.groups.id);

				// Process question type
				let questionType = this.#processQuestionType(question);
				if (questionType === QuestionType.UNKNOWN) {
					e("⚠️ This question type isn't supported");
					console.groupEnd();
					continue;
				}

				// Process answer infos
				let answersHolder = question.querySelector("div.answers");
				if (answersHolder === null) {
					e("No answers holder found in question");
					console.groupEnd();
					continue;
				}

				let answerInfos = [];
				switch (questionType) {
					case QuestionType.CHOICES:
						answerInfos = this.#processAnswersChoices(answersHolder);
						break;
				}

				if (answerInfos.length === 0) {
					// Rely on processing methods above to give error feedback
					console.groupEnd();
					continue;
				}

				let questionInfo = new QuestionInfo(
					questionId,
					questionType,
					answerInfos
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

		#processAnswersChoices(answersHolder) {
			let radioButtons = answersHolder.querySelectorAll("input[type=radio]");
			if (radioButtons.length === 0) {
				e("No radio buttons found in answers holder");
				return null;
			}

			let answerInfos = [];
			for (let radioButton of radioButtons) {
				// Process answer ID
				let elementId = radioButton.id;
				if (elementId === "") {
					e("Radio button has no element ID");
					continue;
				}

				let result = REGEX_ANSWER_ID.exec(elementId);
				if (result === null) {
					e("Unrecognised element ID format for radio button");
					continue;
				}

				let answerId = parseInt(result.groups.id);

				// Process checked status
				let { checked } = radioButton;

				let answerInfo = new ChoicesAnswerInfo(
					answerId,
					radioButton,
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
				// Ongoing quiz
				l("🪄 Using importer mode");
				this.extractorMode = false;
			} else {
				e("Can neither extract nor import (unknown kind of questions holder)");
				this.cannotProceed = true;
				return;
			}

			let questionSelector = "div.question";
			// NodeList to array for array methods
			this.questions = Array.from(
				questionsHolder.querySelectorAll(questionSelector)
			);

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
				case QuestionType.CHOICES:
					this.#importAnswerChoices(
						questionInfo,
						questionData
					);
					break;
				default:
					e("Stored question type not supported");
					return false;
			}

			this.#questionInfos.splice(index, 1);
			return true;
		}

		#importAnswerChoices(questionInfo, questionData) {
			// Clone to remove imported answer data
			let answerDatas = [...questionData.answerInfos];

			for (let answerInfo of questionInfo.answerInfos) {
				// For each element, try to find data of the same answer ID. If found, overwrite
				// checked status (be it checking or unchecking)

				let index = answerDatas.findIndex(
					(answerData) => answerData.id === answerInfo.id
				);
				if (index === -1) {
					e("Answer info is missing corresponding answer data");
					continue;
				}

				let answerData = answerDatas[index];
				answerInfo.element.checked = answerData.checked;
				answerDatas.splice(index, 1);
			}
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

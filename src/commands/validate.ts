import { parse, ParsedSchema, ValidationError } from "@hashmark/parser";
import chalk from "chalk";
import { readFileSync } from "fs";
import { CommandModule } from "..";

export interface ValidateOptions {
	schema?: string;
	file?: string;
}

export const validate: CommandModule<ValidateOptions> = {
	command: "validate <file> <schema>",
	describe: "Validate a Hashmark file with a Hashmark schema",
	aliases: [],

	builder: yargs =>
		yargs
			.positional("file", {
				description: "Path to the Hashmark file to validate",
				type: "string",
				normalize: true,
				demandOption: true
			})
			.positional("schema", {
				description: "Path to the Hashmark schema file",
				type: "string",
				normalize: true,
				demandOption: true
			}),

	handler: argv => {
		try {
			const filePath = argv.file;
			const schemaPath = argv.schema;
			if (filePath === undefined) {
				throw new Error("You must define an input file");
			} else if (schemaPath === undefined) {
				throw new Error("You must define a schema file");
			}

			const schemaFile = readFileSync(schemaPath, "utf-8");
			const schema = new ParsedSchema(parse(schemaFile));
			const file = readFileSync(filePath, "utf-8");
			const ast = parse(file, schema);
			const errors = schema.validateBlock(ast);

			if (errors.length > 0) {
				errors.map(err => printValidationError(err, file.split(/\n|\r\n|\r/), filePath));
				console.log(chalk.redBright(`${errors.length} validation errors were found`));
				process.exit(1);
			} else {
				console.log(chalk.green("No validation errors"));
			}
		} catch (e) {
			console.error(chalk.redBright("Error: " + e.message), "\n");
			console.error(e.stack);
			process.exit(1);
		}
	}
};

const contextSize = 2;
const tabSize = 4;

function printValidationError(error: ValidationError, lines: string[], filePath: string) {
	const positions = error.position.sort(
		(pos1, pos2) =>
			pos1.line - pos2.line || pos1.startCol - pos2.startCol || pos1.endCol - pos2.endCol
	);

	const lineNumbers = positions.map(pos => pos.line);
	const errorLines = new Set(lineNumbers);
	const groups = lineGroups(lineNumbers);
	const groupSeparator = "\u22EE";
	const lastLine = groups[groups.length - 1].last + contextSize;
	const gutterSize = Math.max(groupSeparator.length, lastLine.toString().length);

	printErrorHeader(error, filePath);

	for (let i = 0; i < groups.length; ++i) {
		const group = groups[i];
		const contextStartLineNum = Math.max(1, group.first - contextSize);
		const contextEndLineNum = Math.min(lines.length, group.last + contextSize);

		for (let line = contextStartLineNum; line <= contextEndLineNum; ++line) {
			const j = line - 1;
			const isErrorLine = errorLines.has(line);
			const indentation = Math.max(0, lines[j].search(/[^\t]/));
			const code = lines[j].replace(/\t/g, " ".repeat(tabSize));

			// Print line:
			console.log(lineIndicator(isErrorLine), gutter(gutterSize, line), code);

			// Print column indicator:
			if (isErrorLine) {
				const start = positions[0].startCol + indentation * (tabSize - 1);
				const end = positions[0].endCol + indentation * (tabSize - 1);
				console.log(
					lineIndicator(false),
					gutter(gutterSize, null),
					colIndicator(start, end)
				);
			}
		}

		if (i !== groups.length - 1) {
			console.log();
			console.log(lineIndicator(false), gutter(gutterSize, groupSeparator));
			console.log();
		}
	}
	console.log();
}

// The error header is the name of the error + a link to the file + error message:
function printErrorHeader(error: ValidationError, filePath: string) {
	const locationLink = filePath + ":" + error.position[0].line + ":" + error.position[0].startCol;
	console.log(
		chalk.bold(chalk.redBright(`Error HM${error.code}`)),
		chalk.blueBright(locationLink),
		error.message
	);
}

// If the line contains an error, we write a ">" indicator in front of it:
function lineIndicator(indicate: boolean): string {
	return indicate ? chalk.bold(chalk.redBright(">")) : " ";
}

// The gutter contains a line number (optionally) and a "│" (unicode 9474, 0x2502) separator:
function gutter(size: number, lineNumber: number | string | null): string {
	return chalk.gray(
		String(lineNumber === null ? "" : String(lineNumber)).padStart(size) + " \u2502"
	);
}

// The error position is indicated by "^^^^" under it:
function colIndicator(start: number, end: number): string {
	return " ".repeat(start - 1) + chalk.bold(chalk.redBright("^".repeat(end - start)));
}

function lineGroups(lineNumbers: number[]): Array<{ first: number; last: number }> {
	const first = lineNumbers[0];
	let currentGroup = { first, last: first };
	const groups = [currentGroup];
	for (const lineNumber of lineNumbers) {
		if (currentGroup.last + contextSize >= lineNumber) {
			currentGroup.last = lineNumber;
		} else {
			// new group:
			currentGroup = { first: lineNumber, last: lineNumber };
			groups.push(currentGroup);
		}
	}
	return groups;
}
import chalk from "chalk";

const LOGO = `
  ██████╗  █████╗ ███████╗██╗  ██╗███████╗
  ██╔══██╗██╔══██╗██╔════╝██║ ██╔╝██╔════╝
  ██║  ██║███████║█████╗  █████╔╝ █████╗  
  ██║  ██║██╔══██║██╔══╝  ██╔═██╗ ██╔══╝  
  ██████╔╝██║  ██║██║     ██║  ██╗███████╗
  ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝`;

const TAGLINE = "AI Control Center";

export function printBanner(version: string): void {
  const gradient = [
    chalk.hex("#6366f1"),  // indigo
    chalk.hex("#818cf8"),
    chalk.hex("#a5b4fc"),
    chalk.hex("#c7d2fe"),
    chalk.hex("#818cf8"),
    chalk.hex("#6366f1"),
  ];

  const lines = LOGO.split("\n").filter((l) => l.length > 0);
  const coloredLines = lines.map((line, i) => {
    const colorFn = gradient[i % gradient.length];
    return colorFn ? colorFn(line) : line;
  });

  console.log();
  console.log(coloredLines.join("\n"));
  console.log();
  console.log(
    `  ${chalk.bold.hex("#6366f1")(TAGLINE)}  ${chalk.dim(`v${version}`)}`,
  );
  console.log(
    `  ${chalk.dim("─".repeat(50))}`,
  );
  console.log();
}

export function printCompactBanner(version: string): void {
  console.log(
    `${chalk.bold.hex("#6366f1")("◆ Dafke")} ${chalk.hex("#818cf8")(TAGLINE)} ${chalk.dim(`v${version}`)}`,
  );
}

import chalk from "chalk";

const LOGO = `
  ██████╗  █████╗ ███████╗██╗  ██╗███████╗
  ██╔══██╗██╔══██╗██╔════╝██║ ██╔╝██╔════╝
  ██║  ██║███████║█████╗  █████╔╝ █████╗  
  ██║  ██║██╔══██║██╔══╝  ██╔═██╗ ██╔══╝  
  ██████╔╝██║  ██║██║     ██║  ██╗███████╗
  ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝`;

const TAGLINE = "AI Control Center";
const ACCENT = "#f76707";

export function printBanner(version: string): void {
  const gradient = [
    chalk.hex("#d9480f"),  // deep orange
    chalk.hex("#e8590c"),
    chalk.hex("#f76707"),
    chalk.hex("#ff922b"),
    chalk.hex("#e8590c"),
    chalk.hex("#d9480f"),
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
    `  ${chalk.bold.hex(ACCENT)(TAGLINE)}  ${chalk.dim(`v${version}`)}`,
  );
  console.log(
    `  ${chalk.dim("─".repeat(50))}`,
  );
  console.log();
}

export function printCompactBanner(version: string): void {
  console.log(
    `${chalk.bold.hex(ACCENT)("◆ Dafke")} ${chalk.hex("#ff922b")(TAGLINE)} ${chalk.dim(`v${version}`)}`,
  );
}

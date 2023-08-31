import fs from 'fs';
import path from 'path';

const targetDirectory = 'contracts';

function commentOutConsoleLogs(filePath: string): void {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');
    let modifiedLines: string[] = [];

    let inConsoleLog = false;
    for (const line of lines) {
        if (line.trim() == "import 'hardhat/console.sol';") {
            modifiedLines.push(`// ${line}`);
        } else {
            if (line.trim().startsWith('console.log(')) {
                inConsoleLog = !line.trim().endsWith(');');
                modifiedLines.push(`// ${line}`);
            } else if (inConsoleLog && line.endsWith(');')) {
                inConsoleLog = false;
                modifiedLines.push(`// ${line}`);
            } else if (inConsoleLog) {
                modifiedLines.push(`// ${line}`);
            } else {
                modifiedLines.push(line);
            }
        }
    }

    const modifiedContent = modifiedLines.join('\n');
    fs.writeFileSync(filePath, modifiedContent, 'utf-8');
}

function processFilesInDirectory(directoryPath: string): void {
    const files = fs.readdirSync(directoryPath);
    for (const file of files) {
        const filePath = path.join(directoryPath, file);
        const fileStat = fs.statSync(filePath);

        if (fileStat.isDirectory()) {
            processFilesInDirectory(filePath);
        } else if (file.endsWith('.sol')) {
            console.log(`处理文件: ${filePath}`);
            commentOutConsoleLogs(filePath);
        }
    }
}

processFilesInDirectory(targetDirectory);

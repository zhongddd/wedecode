import {ScanPackagesResultInfo} from "@/typings/index";
import {OperationModeEnum, StreamPathDefaultEnum} from "@/bin/wedecode/enum";
import {startSacnPackagesProcess} from "@/bin/wedecode/scan";
import {checkExistsWithFilePath, startCacheQuestionProcess} from "@/bin/wedecode/common";
import colors from "picocolors";
import DecompilationController from "@/decompilation-controller";
import {sleep} from "@/utils/common";
import prompts from "@/bin/wedecode/inquirer";
import path from "node:path";
import openFileExplorer from "open-file-explorer";
import {PUBLIC_OUTPUT_PATH} from "@/constant/index";

/**
 * 生成带时间戳的唯一文件夹名称
 * */
function generateUniqueFolderName(baseName: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHmmss
  const safeName = baseName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 50);
  return `${safeName}_${timestamp}`;
}

/**
 * 通过命令行交互获取输入和输出路径
 * */
async function setInputAndOutputPath(config: Record<any, any>, opt: {
  hasInputPath: boolean,
  hasOutputPath: boolean
}): Promise<void> {
  const {hasInputPath = false, hasOutputPath = false} = opt || {}
  let packInfo: Partial<ScanPackagesResultInfo>
  if (!hasInputPath) {
    const {selectMode} = await prompts.selectMode()
    if (selectMode === OperationModeEnum.autoScan) {
      packInfo = await startSacnPackagesProcess()
      config.inputPath = packInfo.storagePath
    } else if (selectMode === OperationModeEnum.manualScan) {
      const {manualScanPath} = await prompts.inputManualScanPath()
      packInfo = await startSacnPackagesProcess(manualScanPath)
      config.inputPath = packInfo.storagePath
    } else {
      const {inputPath} = await prompts.questionInputPath()
      config.inputPath = inputPath || config.inputPath
    }
  }
  if (!hasOutputPath) {
    // 使用固定的输出根目录 D:\xiangmu，并在其下创建独立文件夹
    const outputRootPath = PUBLIC_OUTPUT_PATH;
    let outputSubName: string = StreamPathDefaultEnum.defaultOutputPath

    if (packInfo) {
      // 如果有包信息，使用包名生成独立文件夹
      outputSubName = generateUniqueFolderName(packInfo.appName || packInfo.appId || 'unknown_app');
    } else {
      // 没有包信息时使用带时间戳的默认名称
      outputSubName = generateUniqueFolderName('decompile');
    }

    // 输出路径: D:\xiangmu\appname_timestamp\
    config.outputPath = path.resolve(outputRootPath, outputSubName);
  }
}

/**
 * 执行主命令行程序流程
 * */
export async function startMainCommanderProcess(args: string[], argMap: Record<string, any>): Promise<boolean> {
  const hasInputPath = !!args[0]
  const hasOutputPath = !!argMap.out
  const isClear = argMap.clear
  const config = {
    inputPath: args[0] || StreamPathDefaultEnum.inputPath,
    outputPath: argMap.out || StreamPathDefaultEnum.defaultOutputPath
  }
  await setInputAndOutputPath(config, {hasInputPath, hasOutputPath})
  if (!checkExistsWithFilePath(config.inputPath, {throw: true})) return false
  // 经过上面转换， 文件输出位置最终都会在该小程序包同级目录下的 OUTPUT 文件夹中输出
  await startCacheQuestionProcess(isClear, config.inputPath, config.outputPath)
  const decompilationController = new DecompilationController(config.inputPath, config.outputPath)
  decompilationController.setState({
    usePx: argMap.px || false,
    unpackOnly: argMap.unpackOnly || false,
    wxid: argMap.wxid || null,
  })
  await decompilationController.startDecompilerProcess()
  if (argMap.openDir) {
    console.log('\n \u25B6 打开文件管理器: ', colors.yellow(path.resolve(config.outputPath)))
    openFileExplorer(config.outputPath, () => void 0)
  }else {
    console.log('\n \u25B6 输出路径: ', colors.yellow(path.resolve(config.outputPath)))
  }
  await sleep(500)
  return true
}

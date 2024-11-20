#!/usr/bin/env node
/**
 * gsap-video-export
 * github: workeffortwaste
 * twitter: @defaced
 *
 * Source: https://github.com/workeffortwaste/gsap-video-export/
 */
import { videoExport } from './index.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import fs from 'fs'

/* Colors */
const colors = {
  dim: '\x1b[2m',
  reset: '\x1b[0m',
  underscore: '\x1b[4m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m'
}

/* CLI welcome message */
const { version } = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url)))
console.log(`gsap-video-export ${version} / ${colors.blue}@defaced${colors.reset}`)

/* Support */
if (!process.env.WORKEFFORTWASTE_SUPPORTER) {
  console.log(`${colors.magenta}
┃
┃ ${colors.underscore}Support this project! ${colors.reset}${colors.magenta}
┃
┃ Help support the work that goes into creating and maintaining my projects
┃ and consider donating via on GitHub Sponsors.
┃
┃ GitHub Sponsors: https://github.com/sponsors/workeffortwaste/
┃${colors.reset}
  `)
}

const _yargs = yargs(hideBin(process.argv))

/* CLI arguments config */
const options = _yargs
  .wrap(Math.min(110, _yargs.terminalWidth()))
  .default({ r: 'gsap', p: 'auto', c: 'libx264', o: 'video.mp4', t: 'gsap', f: 60, S: 'document', z: 1, V: '1920x1080', v: 'auto', E: '"-pix_fmt yuv420p -crf 18"', q: true, h: true, chrome: false })
  .usage('$0 <url>', 'Export GreenSock (GSAP) animation to video')
  .describe('s', '[browser] Custom script')
  .describe('S', '[browser] DOM selector')
  .describe('t', '[browser] GSAP timeline object')
  .describe('z', '[browser] Scale factor')
  .describe('V', '[browser] Viewport size')
  .describe('i', '[browser] Info only')
  .describe('frame-start', '[browser] Start frame')
  .describe('frame-end', '[browser] End frame')
  .describe('chrome', '[browser] Use the system installed Chrome')
  .describe('cookies', '[browser] Cookies JSON file')
  .describe('a', '[browser] Frame advance method')
  .describe('h', '[browser] Headless mode')
  .describe('p', '[video] Auto padding color')
  .describe('c', '[video] Codec')
  .describe('e', '[video] FFmpeg input options')
  .describe('E', '[video] FFmpeg output options')
  .describe('o', '[video] Filename')
  .describe('f', '[video] Framerate')
  .describe('v', '[video] Output resolution')
  .describe('q', '[tool] Verbose output')
  .alias('i', 'info')
  .alias('o', 'output')
  .alias('t', 'timeline')
  .alias('f', 'fps')
  .alias('c', 'codec')
  .alias('S', 'selector')
  .alias('s', 'script')
  .alias('z', 'scale')
  .alias('e', 'input-options')
  .alias('E', 'output-options')
  .alias('p', 'color')
  .alias('V', 'viewport')
  .alias('v', 'resolution')
  .alias('a', 'advance')
  .alias('q', 'verbose')
  .alias('h', 'headless')
  .number(['f', 'z'])
  .boolean(['i', 'q', 'h', 'chrome'])
  .string(['e', 'E', 'S', 's', 'o', 't', 'v', 'V', 'c', 'p', 'cookies'])
  .epilogue('For more information visit documentation at: \nhttp://github.com/workeffortwaste/gsap-video-export')
  .argv

/* Add CLI flag */
options['cli'] = true
videoExport(options)

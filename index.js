#!/usr/bin/env node
/* eslint-disable no-eval */
/**
 * gsap-video-export
 * github: workeffortwaste
 * twitter: @defaced
 *
 * Source: https://github.com/workeffortwaste/gsap-video-export/
 * /

/* Use puppeteer extra to avoid being picked up as a bot */
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

/* Misc */
import tmp from 'tmp'

/* Video encoders */
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg'
import ffmpeg from 'fluent-ffmpeg'

/* Command line helpers */
import cliProgress from 'cli-progress'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { parseArgsStringToArgv } from 'string-argv'

/* Image helpers */
import { PNG } from 'pngjs'
import rgbHex from 'rgb-hex'
import fs from 'fs'
puppeteer.use(StealthPlugin())
ffmpeg.setFfmpegPath(ffmpegPath)

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
┃ and buy me a coffee via Ko-fi or sponsor me on GitHub Sponsors.
┃
┃ Ko-fi: https://ko-fi.com/defaced
┃ GitHub Sponsors: https://github.com/sponsors/workeffortwaste/
┃${colors.reset}
  `)
}

const _yargs = yargs(hideBin(process.argv))

/* CLI arguments config */
const options = _yargs
  .wrap(Math.min(110, _yargs.terminalWidth()))
  .default({ p: 'auto', c: 'libx264', o: 'video.mp4', t: 'gsap', f: 60, S: 'document', z: 1, V: '1920x1080', v: 'auto', E: '"-pix_fmt yuv420p -crf 18"' })
  .usage('$0 <url>', 'Export GreenSock (GSAP) animation to video')
  .describe('s', '[browser] Custom script')
  .describe('S', '[browser] DOM selector')
  .describe('t', '[browser] GSAP timeline object')
  .describe('z', '[browser] Scale factor')
  .describe('V', '[browser] Viewport size')
  .describe('i', '[browser] Info only')
  .describe('frame-start', '[browser] Start frame')
  .describe('frame-end', '[browser] End frame')
  .describe('p', '[video] Auto padding color')
  .describe('c', '[video] Codec')
  .describe('e', '[video] FFmpeg input options')
  .describe('E', '[video] FFmpeg output options')
  .describe('o', '[video] Filename')
  .describe('f', '[video] Framerate')
  .describe('v', '[video] Output resolution')
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
  .number(['q', 'f', 'z'])
  .string(['e', 'E', 'S', 's', 'o', 't', 'v', 'V', 'c', 'p'])
  .epilogue('For more information visit documentation at: \nhttp://github.com/workeffortwaste/gsap-video-export')
  .argv

/* Explode viewport resolutions */
const resolutions = {
  viewportWidth: parseInt(options.viewport.split('x')[0]), /* An additional 16px is required because puppeteer is coming up short */
  viewportHeight: parseInt(options.viewport.split('x')[1])
}

/* CLI progress bar config */
const b1 = new cliProgress.SingleBar({
  format: '{bar}' + ' {percentage}%',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true,
  autopadding: true,
  barsize: 75
})

/**
 * A helper function to format the time of an animation for the CLI.
 * @param {number} seconds Time in seconds
 * @returns {string} A string HsMsSs formatted string for the CLI
 */
const timeString = (value) => {
  const sec = parseInt(value, 10)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec - (h * 3600)) / 60)
  const s = sec - (h * 3600) - (m * 60)
  if (h) return `${h}h${m}m${s}s`
  if (m) return `${m}m${s}s`
  return `${s}s`
}

/**
 * Helper function to pad two strings of text to the same length with a period.
 * @param {string} item The first string to pad
 * @param {item} status The second string to pad
 * @returns {string} The padded string
 */
const padCenter = (first, last, fail = false) => {
  /* The maximum length of our final string */
  const MAX_LENGTH = 80

  /* Total to pad */
  const pad = MAX_LENGTH - first.length - last.length

  /* Character to pad with */
  const padChar = `${colors.dim}.${colors.reset}`

  /* Return padded string */
  return `${first}${padChar.repeat(pad)}${fail ? `${colors.red}${last}${colors.reset}` : `${colors.blue}${last}${colors.reset}`}`
}

/**
 * Validates the given selector to see if it exists on the DOM.
 * @param {string} selector
 * @returns {boolean}
 */
const discoverSelector = (selector) => {
  if (selector === 'document') return true
  const selection = document.querySelector(selector)
  return !!selection
}

/**
 * A puppeteer function to advance the animation to the specified frame.
 * @param {obj} timeline The greensock timeline to use
 * @param {int} frame
 */
const animationProgressFrame = (timeline, frame) => {
  let _eval = false
  try { _eval = eval(timeline) } catch {}
  // eslint-disable-next-line no-undef
  const _tl = timeline === 'gsap' ? gsap.globalTimeline : _eval
  _tl.pause()
  _tl.progress(frame)
}

/**
 * A puppeteer function to calculate the total number of seconds in the animation.
 * @param {obj} timeline The greensock timeline to use
 * @returns {int} Total number of seconds
 */
const animationDurationSeconds = (timeline) => {
  let _eval = false
  try { _eval = eval(timeline) } catch {}
  // eslint-disable-next-line no-undef
  const _tl = timeline === 'gsap' ? gsap.globalTimeline : _eval
  if (!_tl) return { error: 'No timeline found.' }
  const duration = _tl.duration()
  return duration
}

/**
 * A puppeteer function to calculate the total number of frames in the animation for the given framerate
 * @param {obj} timeline The greensock timeline to use
 * @param {int} fps The framerate to calculate for
 * @returns {int} Total number of frames
 */
const animationDurationFrames = (timeline, fps) => {
  let _eval = false
  try { _eval = eval(timeline) } catch {}
  // eslint-disable-next-line no-undef
  const _tl = timeline === 'gsap' ? gsap.globalTimeline : _eval
  if (!_tl) return { error: 'No timeline found.' }
  const duration = _tl.duration()
  const frames = Math.ceil(duration / 1 * fps)
  return frames
}

/**
 * A puppeteer function to check for the active greensock version.
 * @returns {(boolean|string)} Greensock version
 */
const discoverGsapFramework = () => {
  // eslint-disable-next-line no-undef
  if (window?.gsapVersions) return gsapVersions[0]
  return false
}

/**
 * A puppeteer function to check for existence of a greensock timeline
 * @param {string} timeline The greensock timeline object
 * @returns {boolean} Whether the timeline exists
 */
const discoverTimeline = (timeline) => {
  let _eval = false
  try { _eval = eval(timeline) } catch {}
  // eslint-disable-next-line no-undef
  const _tl = timeline === 'gsap' ? gsap.globalTimeline : _eval
  if (_tl) return true
  return false
}

/**
 * An url helper primarily to break pens out of their iframe for capturing.
 * @param {string} url
 * @returns {string}
 */
const urlHelper = (url) => {
  /* If a standard pen url is found convert it to an URL that works with this tool */
  if (url.includes('//codepen.io/')) {
    /* Use regex groups to reformat the URL */
    const regex = /\/\/codepen.io\/(.*?)\/pen\/(.*?)(?:\/|\?|$)/g
    const [match,, id] = regex.exec(url)

    /* Return the debug codepen url if a match is found */
    return match ? `https://cdpn.io/pen/debug/${id}` : url
  }

  /* Return the url as is without modification */
  return url
}

/**
 * Exit the function cleanly.
 * @param {obj} browser The puppeteer browser object.
 */
const cleanExit = async (browser) => {
  /* Close the browser process */
  await browser.close()
  /* Exit the script */
  process.exit()
}

/**
 * The main video export function
 */
const exportVideo = async () => {
  console.log(`${options.url}\n`)

  /* Start the browser fullscreen in the background (headless) */
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--start-fullscreen'] })
  const page = await browser.newPage()

  /* Set the viewport and scale from the cli options */
  await page.setViewport({ width: resolutions.viewportWidth, height: resolutions.viewportHeight, deviceScaleFactor: options.scale })

  /* Navigate to the specified URL and wait for all resources to load */
  try {
    await page.goto(urlHelper(options.url), { waitUntil: 'networkidle0' })
  } catch (err) {
    console.log(padCenter('Browser', 'FAIL', true))
    await cleanExit(browser)
  }

  /* Print status text */
  console.log(padCenter('Browser', 'OK'))

  /* If a custom script is specified and exists */
  if (options.script && fs.existsSync(options.script)) {
    /* Load the script */
    const customScript = fs.readFileSync(options.script, 'utf8')
    /* Run the script within the page context */
    await page.evaluate(customScript => { eval(customScript) }, customScript)
  }

  /* Wait for a bit because GSAP takes a little bit of time to initialise and the script was missing it. */
  page.waitForTimeout(2000)

  /* Check the selector exists */
  const validSelector = await page.evaluate(discoverSelector, options.selector)

  /* Print status text */
  console.log(padCenter('Selector', validSelector ? `(${options.selector}) OK` : `(${options.selector}) FAIL`, !validSelector))

  /* Exit if invalid selector */
  if (!validSelector) await cleanExit(browser)

  /* Scroll the selected element into view if it's not set as document */
  if (options.selector !== 'document') {
    await page.evaluate((selector) => { document.querySelector(selector).scrollIntoViewIfNeeded() }, options.selector)
  }

  /* Discover the gsap framework version */
  const gsapVersion = await page.evaluate(discoverGsapFramework)

  /* Print status text */
  console.log(padCenter('GSAP', gsapVersion ? 'v' + gsapVersion : 'FAIL', !gsapVersion))

  /* Exit if no gsap framework found on the window obj */
  if (!gsapVersion) await cleanExit(browser)

  /* Discover the gsap timeline object */
  const timeline = await page.evaluate(discoverTimeline, options.timeline)

  /* Print status text */
  console.log(padCenter('Timeline', timeline ? `(${options.timeline}) OK` : 'FAIL', !timeline))

  /* Exit if no gsap timeline is available */
  if (!timeline) await cleanExit(browser)

  /* Calculate the animation length */
  const durationSeconds = await page.evaluate(animationDurationSeconds, options.timeline)
  const duration = await page.evaluate(animationDurationFrames, options.timeline, options.fps)

  /* Exit if it's an infinite loop */
  if (durationSeconds > 3600) {
    console.log(padCenter('Duration', 'INFINITE', true))
    await cleanExit(browser)
  }

  /* Print status text */
  console.log(padCenter('Duration', durationSeconds !== 0 ? timeString(durationSeconds.toFixed(1)) : 'FAIL', durationSeconds === 0))

  /* Exit if the animation length is 0 */
  if (durationSeconds === 0) await cleanExit(browser)

  /* Print status text */
  console.log(padCenter('Frames', duration.toString(), false))

  /* If the info flag is toggled exit cleanly */
  if (options.info) await cleanExit(browser)

  /* Set up the tmp directory */
  const tmpobj = tmp.dirSync()

  /* Print status text */
  console.log('\nExporting animation frames\n')

  /* Set the start and end frames */
  const startFrame = options['frame-start'] || 0
  const endFrame = options['frame-end'] || duration

  /* Start the CLI export progress bar */
  b1.start(endFrame, startFrame)

  /* Time frame export */
  const timeFrames = process.hrtime()

  /* Progress the animation and take a screenshot */
  let frameStep = 0
  for (let x = startFrame; x < endFrame; x++) {
    const frame = x / duration

    /* Progress the timeline to the specified frame */
    await page.evaluate(animationProgressFrame, options.timeline, frame)

    /* Select the DOM element via the specified selector */
    const el = options.selector === 'document' ? page : await page.$(options.selector)

    /* Take a screenshot */
    await el.screenshot({ path: tmpobj.name + '/' + frameStep + '.png' })

    /* Increment and update the CLI export progress bar */
    b1.increment()
    b1.update(x + 1)

    /* Increment the frame step */
    frameStep++
  }

  /* Time (stop) frame export */
  const timeFramesStop = process.hrtime(timeFrames)

  /* Stop the CLI export progress bar */
  b1.stop()

  /* Now we've captured all the frames quit the browser to focus on encoding the video */
  await browser.close()

  /* Read the first frame of the animation */
  let png = PNG.sync.read(fs.readFileSync(tmpobj.name + '/0' + '.png'))

  /* Get some basic image information for video rendering */
  /* By getting the resoution this way we can make a video of the output video size regardless of browser viewport and scaling settings */
  const image = {
    height: png.height,
    width: png.width,
    pixelSample: rgbHex(png.data[0], png.data[1], png.data[2])
  }

  /* Free up a bit of memory */
  png = null

  /* Set output size */
  const finalResolution = options.resolution === 'auto' ? `${image.width}x${image.height}` : options.resolution

  /* Pad color */
  const padColor = options.color === 'auto' ? image.pixelSample : options.color

  /* Add some more information about the video we're making */
  console.log('\n')
  console.log(padCenter('Output resolution', `${options.resolution === 'auto' ? '(auto) ' : ''}${finalResolution}`))
  console.log(padCenter('Padding color', `${options.color === 'auto' ? '(auto) ' : ''}#${padColor.toUpperCase()}`))

  /* Timing vars */
  let timeRender, timeRenderStop

  /* Encode the video */
  const render = ffmpeg()
    .addInput(tmpobj.name + '/%d.png')
    .videoCodec(options.codec)
    .inputFPS(options.fps)
    .size(finalResolution)
    .autopad(padColor)
    .format('mp4')
    .output(options.output)
    .on('start', function (commandLine) {
      console.log('\nRendering video\n')
      b1.start(100, 0)
      /* Time render */
      timeRender = process.hrtime()
    })
    .on('progress', function (progress) {
      b1.increment()
      b1.update(Math.ceil(progress.percent))
    })
    .on('end', function () {
      /* Set the progress bar to 100% */
      b1.increment()
      b1.update(100)

      /* Stop the timer */
      b1.stop()

      /* Time (stop) render */
      timeRenderStop = process.hrtime(timeRender)

      console.log('\nTime elapsed\n')
      console.log(padCenter('Export', ((timeFramesStop[0] * 1e9 + timeFramesStop[1]) / 1e9).toFixed(2).toString() + 's', false))
      console.log(padCenter('Render', ((timeRenderStop[0] * 1e9 + timeRenderStop[1]) / 1e9).toFixed(2).toString() + 's', false))

      /* Success */
      console.log(`\nVideo succesfully exported as ${colors.blue}${options.output}`)
    })

  /* Additional ffmpeg io options */
  if (options['input-options']) render.inputOptions(...parseArgsStringToArgv(options['input-options'].slice(1, -1)))
  if (options['output-options']) render.outputOptions(...parseArgsStringToArgv(options['output-options'].slice(1, -1)))

  render.run()
}

/* GO */
exportVideo()

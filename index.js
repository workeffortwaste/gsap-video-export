/* eslint-disable no-eval */
/**
 * gsap-video-export
 * github: workeffortwaste
 * twitter: @defaced
 *
 * Source: https://github.com/workeffortwaste/gsap-video-export/
 */
import puppeteer from 'puppeteer'
import { findChrome } from 'find-chrome-bin'

/* Misc */
import tmp from 'tmp'
import path from 'path'

/* Video encoders */
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg'
import ffmpeg from 'fluent-ffmpeg'

/* Command line helpers */
import cliProgress from 'cli-progress'
import { parseArgsStringToArgv } from 'string-argv'

/* Image helpers */
import { PNG } from 'pngjs'
import rgbHex from 'rgb-hex'
import fs from 'fs'

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
 * A puppeteer function to advance the gsap timeline to the specified frame.
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
 * An url helper primarily to break pens out of their iframe for capturing,
 * and to format URLs correctly for local files.
 * @param {string} url
 * @returns {string}
 */
const urlHelper = (url) => {
  /* If the url doesn't begin with https:// or http://, then it's a local file and we need to format it for puppeteer. */
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    if (url.startsWith('file://')) return url /* The user has already formatted it as a file url */

    /* Resolve the full dir of the file */
    const file = path.resolve(process.cwd(), url)
    return `file://${file}`
  }

  /* If a standard pen url is found convert it to an URL that works with this tool */
  if (url.includes('//codepen.io/')) {
    /* Use regex groups to reformat the URL */
    const regex = /\/\/codepen.io\/(.*?)\/pen\/(.*?)$/g
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
  if (browser) await browser.close()
  /* Exit the script */
  process.exit()
}

/**
 * Exit the function with an error
 * @param {obj} browser The puppeteer browser object.
 */
const dirtyExit = async (browser, error) => {
  /* Close the browser process */
  if (browser) await browser.close()
  /* Exit the script */
  throw new Error(error)
}

/** Log
 * A helper function to log messages to the console.
 * @param {string} msg The message to log
 * @param {boolean} verbose Whether to log the message or not
 */
const log = (msg, verbose) => {
  if (verbose) console.log(msg)
}

/**
 * The main video export function
 */
const videoExport = async (options) => {
  if (!options.url) {
    log('No URL specified', options.verbose)
    cleanExit()
  }

  log(`${options.url}\n`, options.verbose)

  /* Set defaults if they don't exist */
  options.viewport = options.viewport || '1920x1080'
  options.scale = options.scale || 1
  options.advance = options.advance || 'gsap'
  options.color = options.color || 'auto'
  options.codec = options.codec || 'libx264'
  options.fps = options.fps || 60
  options.output = options.output || 'video.mp4'
  options.selector = options.selector || 'document'
  options.resolution = options.resolution || 'auto'
  options['output-options'] = options['output-options'] || '"-pix_fmt yuv420p -crf 18"'
  options.quiet = options.quiet !== undefined ? options.quiet : true /* Default to quiet mode if not specified */
  options.headless = options.headless !== undefined ? options.headless : true /* Default to headless mode if not specified */
  options.timeline = options.timeline || 'gsap'
  options.chrome = options.chrome !== undefined ? options.chrome : false
  options.cookies = options.cookies || null

  /* Explode viewport resolutions */
  const resolutions = {
    viewportWidth: parseInt(options.viewport.split('x')[0]), /* An additional 16px is required because puppeteer is coming up short */
    viewportHeight: parseInt(options.viewport.split('x')[1])
  }

  /* Start the browser fullscreen in the background (headless) */
  let browser
  let executablePath = null

  if (options.chrome) {
    const chromeLocation = await findChrome()
    executablePath = chromeLocation.executablePath
  }

  if (options.headless) {
    browser = await puppeteer.launch({ executablePath, headless: true, defaultViewport: null, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--allow-file-access-from-files', '--kiosk'] })
  } else {
    browser = await puppeteer.launch({ executablePath, headless: false, defaultViewport: null, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--allow-file-access-from-files'] })
  }
  const page = await browser.newPage()

  if (options.cookies) {
    const cookies = JSON.parse(fs.readFileSync(options.cookies))
    await page.setCookie(...cookies)
  }

  /* Set the viewport and scale from the cli options */
  await page.setViewport({ width: resolutions.viewportWidth, height: resolutions.viewportHeight, deviceScaleFactor: options.scale })

  /* Pause animations */
  if (options.advance === 'timeweb') {
    /* Load the script */
    const timeweb = fs.readFileSync('./node_modules/timeweb/dist/timeweb.js', 'utf8')
    log(timeweb, options.verbose)
    /* Run the script within the page context */
    await page.evaluateOnNewDocument(timeweb => { eval(timeweb) }, timeweb)
  }

  /* Navigate to the specified URL and wait for all resources to load */
  try {
    await page.goto(urlHelper(options.url), { waitUntil: 'networkidle0' })
  } catch (err) {
    log(padCenter('Browser', 'FAIL', true), options.verbose)
    if (options.cli) {
      await cleanExit(browser)
    } else {
      await dirtyExit(browser, 'Unable to load the specified URL')
    }
  }

  /* Print status text */
  log(padCenter('Browser', 'OK'), options.verbose)

  /* If a custom script is specified and exists */
  if (options.script && fs.existsSync(options.script)) {
    /* Load the script */
    const customScript = fs.readFileSync(options.script, 'utf8')
    /* Run the script within the page context */
    try {
      await page.evaluate(customScript => { eval(customScript) }, customScript)
    } catch (err) {
      if (options.cli) {
        await cleanExit(browser)
      } else {
        await dirtyExit(browser, 'Unable to run the specified script: ' + err)
      }
    }
  }

  // /* Wait for a bit because GSAP takes a little bit of time to initialise and the script was missing it. */
  await new Promise(resolve => setTimeout(resolve, 2000))
  // await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 12000)))

  /* Check the selector exists */
  const validSelector = await page.evaluate(discoverSelector, options.selector)

  /* Print status text */
  log(padCenter('Selector', validSelector ? `(${options.selector}) OK` : `(${options.selector}) FAIL`, !validSelector), options.verbose)

  /* Exit if invalid selector */
  if (!validSelector) {
    if (options.cli) {
      await cleanExit(browser)
    } else {
      await dirtyExit(browser, 'Invalid selector')
    }
  }

  /* Scroll the selected element into view if it's not set as document */
  if (options.selector !== 'document') {
    await page.evaluate((selector) => { document.querySelector(selector).scrollIntoViewIfNeeded() }, options.selector)
  }

  /* Discover the gsap framework version */
  const gsapVersion = await page.evaluate(discoverGsapFramework)

  /* Print status text */
  log(padCenter('GSAP', gsapVersion ? 'v' + gsapVersion : 'FAIL', !gsapVersion), options.verbose)

  /* Exit if no gsap framework found on the window obj */
  if (!gsapVersion) {
    if (options.cli) {
      await cleanExit(browser)
    } else {
      await dirtyExit(browser, 'GSAP framework not found')
    }
  }

  /* Discover the gsap timeline object */
  const timeline = await page.evaluate(discoverTimeline, options.timeline)

  /* Print status text */
  log(padCenter('Timeline', timeline ? `(${options.timeline}) OK` : 'FAIL', !timeline), options.verbose)

  /* Exit if no gsap timeline is available */
  if (!timeline) {
    if (options.cli) {
      await cleanExit(browser)
    } else {
      await dirtyExit(browser, 'GSAP timeline not found')
    }
  }

  /* Calculate the animation length */
  const durationSeconds = await page.evaluate(animationDurationSeconds, options.timeline)
  const duration = await page.evaluate(animationDurationFrames, options.timeline, options.fps)

  /* Exit if it's an infinite loop */
  if (durationSeconds > 3600) {
    log(padCenter('Duration', 'INFINITE', true), options.verbose)

    if (options.cli) {
      await cleanExit(browser)
    } else {
      await dirtyExit(browser, 'Infinite loop detected')
    }
  }

  /* Print status text */
  log(padCenter('Duration', durationSeconds !== 0 ? timeString(durationSeconds.toFixed(1)) : 'FAIL', durationSeconds === 0), options.verbose)

  /* Exit if the animation length is 0 */
  if (durationSeconds === 0) {
    if (options.cli) {
      await cleanExit(browser)
    } else {
      await dirtyExit(browser, 'Animation duration is 0')
    }
  }

  /* Print status text */
  log(padCenter('Frames', `(${options.advance}) ${duration.toString()}`, false), options.verbose)

  /* If the info flag is toggled exit cleanly */
  if (options.info && !options.cli) {
    await browser.close()
    return {
      duration: durationSeconds,
      frames: duration,
      gsap: gsapVersion,
      timeline: options.timeline
    }
  }
  if (options.info) await cleanExit(browser)

  /* Set up the tmp directory */
  const tmpobj = tmp.dirSync()

  /* Print status text */
  log('\nExporting animation frames\n', options.verbose)

  /* Set the start and end frames */
  const startFrame = options['frame-start'] || 0
  const endFrame = options['frame-end'] || duration

  /* Start the CLI export progress bar */
  if (options.verbose) b1.start(endFrame, startFrame)

  /* Time frame export */
  const timeFrames = process.hrtime()

  /* Progress the animation and take a screenshot */
  let frameStep = 0
  for (let x = startFrame; x < endFrame; x++) {
    const frame = x / duration

    /* Progress the timeline to the specified frame */
    if (options.advance === 'gsap') {
      await page.evaluate(animationProgressFrame, options.timeline, frame)
    } else {
      /* Time in ms to advance the frames */
      const interval = 1000 / options.fps
      /* Shift the ms along slightly to avoid errors with weird gsap code */
      const ms = interval * frameStep + 1

      await page.evaluate((ms) => {
        window.timeweb.goTo(ms)
      }, ms)
    }

    /* Select the DOM element via the specified selector */
    const el = options.selector === 'document' ? page : await page.$(options.selector)

    /* Take a screenshot */
    await el.screenshot({ path: tmpobj.name + '/' + frameStep + '.png' })

    /* Increment and update the CLI export progress bar */
    if (options.verbose) b1.increment()
    if (options.verbose) b1.update(x + 1)

    /* Increment the frame step */
    frameStep++
  }

  /* Time (stop) frame export */
  const timeFramesStop = process.hrtime(timeFrames)

  /* Stop the CLI export progress bar */
  if (options.verbose) b1.stop()

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
  log('\n', options.verbose)
  log(padCenter('Output resolution', `${options.resolution === 'auto' ? '(auto) ' : ''}${finalResolution}`), options.verbose)
  log(padCenter('Padding color', `${options.color === 'auto' ? '(auto) ' : ''}#${padColor.toUpperCase()}`), options.verbose)

  /* Timing vars */
  let timeRender, timeRenderStop

  /* Encode the video */
  return new Promise((resolve, reject) => {
    const render = ffmpeg()
      .addInput(tmpobj.name + '/%d.png')
      .videoCodec(options.codec)
      .inputFPS(options.fps)
      .size(finalResolution)
      .autopad(padColor)
      .format('mp4')
      .output(options.output)
      .on('start', function (commandLine) {
        log('\nRendering video\n', options.verbose)
        if (options.verbose) b1.start(100, 0)
        /* Time render */
        timeRender = process.hrtime()
      })
      .on('progress', function (progress) {
        if (options.verbose) b1.increment()
        if (options.verbose) b1.update(Math.ceil(progress.percent))
      })
      .on('end', function () {
        /* Set the progress bar to 100% */
        if (options.verbose) b1.increment()
        if (options.verbose) b1.update(100)

        /* Stop the timer */
        if (options.verbose) b1.stop()

        /* Time (stop) render */
        timeRenderStop = process.hrtime(timeRender)

        log('\nTime elapsed\n', options.verbose)
        log(padCenter('Export', ((timeFramesStop[0] * 1e9 + timeFramesStop[1]) / 1e9).toFixed(2).toString() + 's', false), options.verbose)
        log(padCenter('Render', ((timeRenderStop[0] * 1e9 + timeRenderStop[1]) / 1e9).toFixed(2).toString() + 's', false), options.verbose)

        /* Success */
        log(`\nVideo succesfully exported as ${colors.blue}${options.output}${colors.reset}`, options.verbose)
        resolve({
          file: options.output,
          exportTime: +((timeFramesStop[0] * 1e9 + timeFramesStop[1]) / 1e9).toFixed(2),
          renderTime: +((timeRenderStop[0] * 1e9 + timeRenderStop[1]) / 1e9).toFixed(2)
        })
      })
      .on('error', function (err) {
        reject(err)
      })

    /* Additional ffmpeg io options */
    if (options['input-options']) render.inputOptions(...parseArgsStringToArgv(options['input-options'].slice(1, -1)))
    if (options['output-options']) render.outputOptions(...parseArgsStringToArgv(options['output-options'].slice(1, -1)))

    render.run()
  })
}

/* GO */
export { videoExport }

// Author: Mahan Fathi, https://github.com/Mahan-F/test-project-action

const axios = require('axios')
const core = require('@actions/core')

// get parameter url from action input
const APPLICATION_URL = strip(process.env.INPUT_APPLICATION_URL)


const API_URL = `https://api.testproject.io/v2/projects/${ strip(process.env.INPUT_PROJECT_ID) }/jobs`
const API_HEADER = {
  'Authorization': strip(process.env.INPUT_API_KEY)
}
const CHECK_INTERVAL = parseInt(strip(process.env.INPUT_CHECK_INTERVAL)) * 1000
const WAIT_FOR_TESTS = strip(process.env.INPUT_WAIT_FOR_TESTS) === 'true'

// Keep track of all jobs
const jobsStatus = []

async function main() {

  core.info(`Get application url `);

  core.info(APPLICATION_URL);

  core.info(`Getting a list of all jobs in project ${ strip(process.env.INPUT_PROJECT_ID) }`)

  // Get a list of jobs
  const jobs = await getJobs().catch( err => {
    core.setFailed(`Unable to get jobs.`)
    console.log(err)
    return
  })

  await executeAllJobs(jobs)

  if ( WAIT_FOR_TESTS ) {
    await periodicallyCheckJobStatus(jobs)
  }

}

/**
 * Get a list of all jobs that exist in the given project
 * @returns Array of jobs from TestProject API
 */
async function getJobs() {

  const jobs = await axios({
    method: 'get',
    url: API_URL,
    headers: API_HEADER
  })

  core.info(`Found ${ jobs.data.length } test job(s) to execute.`)

  return jobs.data
}

/**
 * Executes all the jobs passed in the parameter and adds them to the `jobsStatus` array
 * @param {*} jobs Array of jobs to execute
 * @returns a promise once all executions are complete
 */
async function executeAllJobs(jobs) {

  return new Promise((resolve, reject) => {

    const executionPromises = []
    for ( let i = 0; i < jobs.length; i++ ) {

      core.info("============== Executing job ");
      core.info(`Executing job ${jobs[i].name} (${jobs[i].id})`);
      core.inf(APPLICATION_URL);
  
      const executeJob = axios({
        method: "post",
        url: `${API_URL}/${jobs[i].id}/run`,
        headers: API_HEADER,
        data: {
          projectParameters: {
            ApplicationURL: APPLICATION_URL,
          },
        },
      }).catch((err) => {
        core.setFailed(
          `Execution failed for job ${jobs[i].id} (${jobs[i].name})`
        );
        console.log(err);
        return;
      });

      executionPromises.push( executeJob )
  
    }

    Promise.all( executionPromises ).then( results => {

      results.forEach( (result, i) => {
        core.info(`Executed job ${ jobs[i].id } (${ jobs[i].name }). Execution ID: ${ result.data.id }`)
    
        jobsStatus.push({
          ...jobs[i],
          status: 'Pending',
          executionId: result.data.id
        })
      })

      return resolve(true)

    })

  })

}

/**
 * Calls TestProject state API for every pending job execution periodically until 
 * all executions are finished (Passed/Failed)
 * @param {*} jobs Array of jobs to execute
 */
async function periodicallyCheckJobStatus(jobs) {

  const jobStatusInterval = setInterval( async () => {
  
    const pendingJobs = jobsStatus.filter( x => x.status === 'Pending' )
    core.info(`Checking status of running tests (${ pendingJobs.length } test(s))`)
  
    for ( let i = 0; i < pendingJobs.length; i++ ) {
      const jobStatus = await axios({
        method: 'get',
        url: `${ API_URL }/${ pendingJobs[i].id }/executions/${ pendingJobs[i].executionId }/state`,
        headers: API_HEADER
      }).catch( err => {
        core.setFailed(`Job state check failed for job ${ pendingJobs[i].id } (${ pendingJobs[i].name })`)
        console.log(err)
        return Promise.resolve(true)
      })
  
      if ( jobStatus.data.state === 'Executing' || jobStatus.data.state === 'Ready' ) {
        continue;
      } else if ( jobStatus.data.state === 'Failed' || jobStatus.data.state === 'Passed' ) {
        
        // Update the status of the job
        jobsStatus.find( x => x.id === pendingJobs[i].id ).status = jobStatus.data.state

        // Log status of the job
        if ( jobStatus.data.state === 'Passed' ) {
          core.info(`Job execution ${ pendingJobs[i].executionId } (${ pendingJobs[i].name }) passed.`)
        } else {
          core.error(`Job execution ${ pendingJobs[i].executionId } (${ pendingJobs[i].name }) failed.`)
        }

      } 
  
    }

    // If no more pending jobs are left, end
    if ( jobsStatus.filter( x => x.status === 'Pending' ).length === 0 ) {
  
      core.startGroup('Job data')
      console.log(jobsStatus)
      core.endGroup()
  
      core.info('Finished running tests')
      clearInterval(jobStatusInterval)
  
      const failedJobs = jobsStatus.filter( x => x.status === 'Failed' )
  
      if ( failedJobs.length ) {
        core.error(`Failed Tests: ${ failedJobs.map( x => x.name ).join(', ') }`)
        core.setFailed(`${ failedJobs.length } tests failed.`)
      }

      return Promise.resolve(true)
    }
  
  }, CHECK_INTERVAL);

}

/**
 * Strip leading or trailing whitespace
 * @param {*} val Value to strip
 * @returns Stripped text
 */
function strip(val) {
  return (val || '').replace(/^\s*|\s*$/g, '');
}

main()

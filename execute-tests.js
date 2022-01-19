// Author: Mahan Fathi, https://github.com/Mahan-F/test-project-action

const axios = require('axios')
const core = require('@actions/core')

async function main() {

  core.info(`Getting a list of all jobs in project ${ strip(process.env.INPUT_PROJECT_ID) }`)

  // Keep track of all jobs
  const jobsStatus = []

  // Get a list of jobs
  const jobs = await axios({
    method: 'get',
    url: `https://api.testproject.io/v2/projects/${ strip(process.env.INPUT_PROJECT_ID) }/jobs`,
    headers: {
      'Authorization': strip(process.env.INPUT_API_KEY)
    }
  }).catch( err => {
    core.setFailed(`Unable to get jobs.`)
    console.log(err)
    return
  })

  core.info(`Found ${ jobs.data.length } test job(s) to execute.`)

  // Execute all jobs
  for ( let i = 0; i < 1; i++ ) {

    const executeJob = await axios({
      method: 'post',
      url: `https://api.testproject.io/v2/projects/${ strip(process.env.INPUT_PROJECT_ID) }/jobs/${ jobs.data[i].id }/run`,
      headers: {
        'Authorization': strip(process.env.INPUT_API_KEY)
      }
    }).catch( err => {
      core.setFailed(`Execution failed for job ${ jobs.data[i].id } (${ jobs.data[i].name })`)
      console.log(err)
      return
    })

    core.info(`Executed job ${ jobs.data[i].id } (${ jobs.data[i].name }). Execution ID: ${ executeJob.data.id }`)

    jobsStatus.push({
      ...jobs.data[i],
      status: 'Pending',
      executionId: executeJob.data.id
    })

  }

  // Check status of jobs periodically
  const jobStatusInterval = setInterval( async () => {
  
    const pendingJobs = jobsStatus.filter( x => x.status === 'Pending' )
    core.info(`Checking status of running tests (${ pendingJobs.length } test(s))`)
    
    if ( pendingJobs.length === 0 ) {
  
      core.startGroup('Job data')
      console.log(jobsStatus)
      core.endGroup()
  
      core.info('Finished running tests')
      clearInterval(jobStatusInterval)
  
      const failedJobs = jobsStatus.filter( x => x.status === 'Failed' )
  
      if ( failedJobs.length ) {
        core.error(`Failed Tests: ${ failedJobs.map( x => x.name ).join(', ') }`)
        core.setFailed(`${ failedJobs.length } tests failed.`)
      } else {
        return;
      }
    }
  
    for ( let i = 0; i < pendingJobs.length; i++ ) {
      const jobStatus = await axios({
        method: 'get',
        url: `https://api.testproject.io/v2/projects/${ strip(process.env.INPUT_PROJECT_ID) }/jobs/${ pendingJobs[i].id }/executions/${ pendingJobs[i].executionId }/state`,
        headers: {
          'Authorization': strip(process.env.INPUT_API_KEY)
        }
      }).catch( err => {
        core.setFailed(`Job state check failed for job ${ pendingJobs[i].id } (${ pendingJobs[i].name })`)
        console.log(err)
        return
      })
  
      if ( jobStatus.data.state === 'Executing' || jobStatus.data.state === 'Ready' ) {
        continue;
      } else if ( jobStatus.data.state === 'Failed' ) {
        core.error(`Found ${ jobs.data.length } test job(s) to execute.`)
        jobsStatus.find( x => x.id === pendingJobs[i].id ).status = jobStatus.data.state
      } else if ( jobStatus.data.state === 'Passed' ) {
        core.info(`Found ${ jobs.data.length } test job(s) to execute.`)
        jobsStatus.find( x => x.id === pendingJobs[i].id ).status = jobStatus.data.state
      } 
  
    }
  
  }, 15000);

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

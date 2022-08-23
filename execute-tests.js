// Author: Mahan Fathi, https://github.com/Mahan-F/test-project-action

const axios = require('axios')
const core = require('@actions/core')
const { exec } = require("child_process");

// get parameter url from action input
const APPLICATION_URL = strip(process.env.INPUT_APPLICATION_URL);

const API_URL = `https://api.testproject.io/v2/projects/${strip(
  process.env.INPUT_PROJECT_ID
)}/jobs`;
const API_HEADER = {
  Authorization: strip(process.env.INPUT_API_KEY),
};
const CHECK_INTERVAL = parseInt(strip(process.env.INPUT_CHECK_INTERVAL)) * 1000;
const WAIT_FOR_TESTS = strip(process.env.INPUT_WAIT_FOR_TESTS) === "true";
const AGENT = strip(process.env.INPUT_AGENT);
const WAITING_EXECUTION_TIME = parseInt(
  strip(process.env.INPUT_WAITING_EXECUTION_TIME)
);

// Keep track of all jobs
const jobsStatus = [];

async function runAgent() {
  exec(
    `TP_API_KEY=${strip(process.env.INPUT_API_KEY)}
     echo $TP_API_KEY 
     docker-compose -f .github/ci/docker-compose.yml up -d`,
    (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
    }
  );
}

async function main() {
  core.info("Creat agent");
  runAgent();
  // Add time out to stop execution after time
  setTimeout(() => {
    core.setFailed(
      `${WAITING_EXECUTION_TIME} minutes have passed, the execution is stopped`
    );
    process.exit(0);
  }, WAITING_EXECUTION_TIME * 60);

  core.info(`Get application url `);
  core.info(process.env.INPUT_API_KEY);

  core.info(APPLICATION_URL);

  core.info(
    `Getting a list of all jobs in project ${strip(
      process.env.INPUT_PROJECT_ID
    )}`
  );

  var agentId = null;

  if (AGENT) {
    agentId = await getAgentId().catch((err) => {
      core.setFailed(`Failed to get agent with error: ${err}`);
      console.log(err);
      return;
    });
    core.info(`Agent id used : ${agentId}`);
  }

  // Get a list of jobs
  const jobs = await getJobs().catch((err) => {
    core.setFailed(`Unable to get jobs.`);
    console.log(err);
    return;
  });

  await executeAllJobs(jobs, agentId);

  if (WAIT_FOR_TESTS) {
    await periodicallyCheckJobStatus(jobs);
  }
}

/**
 * Get a list of all jobs that exist in the given project
 * @returns Array of jobs from TestProject API
 */
async function getJobs() {
  const jobs = await axios({
    method: "get",
    url: API_URL,
    headers: API_HEADER,
  });

  core.info(
    `Found ${jobs.data.length} test job(s) to execute in project ${strip(
      process.env.INPUT_PROJECT_ID
    )}`
  );

  return jobs.data;
}

/**
 * Get a list of all jobs that exist in the given project
 * @returns Array of jobs from TestProject API
 */
async function getAgentId() {
  const agent = await axios({
    method: "get",
    url: "https://api.testproject.io/v2/agents?_start=0&_limit=10",
    headers: API_HEADER,
  });

  // get type of agent
  core.info(
    `Found ${agent.data.find((e) => e.state === "Idle")} agent(s) active`
  );

  return agent.data.find((e) => e.state === "Idle").id;
}

/**
 * Executes all the jobs passed in the parameter and adds them to the `jobsStatus` array
 * @param {*} jobs Array of jobs to execute
 * @returns a promise once all executions are complete
 */
async function executeAllJobs(jobs, agentId) {
  return new Promise((resolve, reject) => {
    const executionPromises = [];
    core.info(`Application url : ${APPLICATION_URL}`);
    for (let i = 0; i < jobs.length; i++) {
      core.info(`Executing job ${jobs[i].name} (${jobs[i].id})`);

      // init data for job
      var data = {
        testParameters: [{ data: [{ ApplicationURL: APPLICATION_URL }] }],
      };

      // check if agentid is passed function
      if (agentId) data.agentId = agentId;

      const executeJob = axios({
        method: "post",
        url: `${API_URL}/${jobs[i].id}/run`,
        headers: API_HEADER,
        data: data,
      }).catch((err) => {
        core.setFailed(
          `Execution failed for job ${jobs[i].id} (${jobs[i].name}) with error: ${err}`
        );
        console.log(err);
        return;
      });

      executionPromises.push(executeJob);
    }

    Promise.all(executionPromises).then((results) => {
      results.forEach((result, i) => {
        core.info(
          `Executed job ${jobs[i].id} (${jobs[i].name}). Execution ID: ${result.data.id}`
        );

        jobsStatus.push({
          ...jobs[i],
          status: "Pending",
          executionId: result.data.id,
        });
      });

      return resolve(true);
    });
  });
}

/**
 * Calls TestProject state API for every pending job execution periodically until
 * all executions are finished (Passed/Failed)
 * @param {*} jobs Array of jobs to execute
 */
async function periodicallyCheckJobStatus(jobs) {
  const jobStatusInterval = setInterval(async () => {
    const pendingJobs = jobsStatus.filter((x) => x.status === "Pending");
    core.info(
      `Checking status of running tests (${pendingJobs.length} test(s))`
    );

    for (let i = 0; i < pendingJobs.length; i++) {
      const jobStatus = await axios({
        method: "get",
        url: `${API_URL}/${pendingJobs[i].id}/executions/${pendingJobs[i].executionId}/state`,
        headers: API_HEADER,
      }).catch((err) => {
        core.setFailed(
          `Job state check failed for job ${pendingJobs[i].id} (${pendingJobs[i].name})`
        );
        console.log(err);
        return Promise.resolve(true);
      });

      if (
        jobStatus.data.state === "Executing" ||
        jobStatus.data.state === "Ready"
      ) {
        continue;
      } else if (
        jobStatus.data.state === "Failed" ||
        jobStatus.data.state === "Passed"
      ) {
        // Update the status of the job
        jobsStatus.find((x) => x.id === pendingJobs[i].id).status =
          jobStatus.data.state;

        // Log status of the job
        if (jobStatus.data.state === "Passed") {
          core.info(
            `Job execution ${pendingJobs[i].executionId} (${pendingJobs[i].name}) passed.`
          );
        } else {
          core.error(
            `Job execution ${pendingJobs[i].executionId} (${pendingJobs[i].name}) failed.`
          );
        }
      }
    }

    // If no more pending jobs are left, end
    if (jobsStatus.filter((x) => x.status === "Pending").length === 0) {
      core.startGroup("Job data");
      console.log(jobsStatus);
      core.endGroup();

      core.info("Finished running tests");
      clearInterval(jobStatusInterval);

      const failedJobs = jobsStatus.filter((x) => x.status === "Failed");

      if (failedJobs.length) {
        core.error(`Failed Tests: ${failedJobs.map((x) => x.name).join(", ")}`);
        core.setFailed(`${failedJobs.length} tests failed.`);
      }

      return Promise.resolve(true);
    }
  }, CHECK_INTERVAL);
}

/**
 * Strip leading or trailing whitespace
 * @param {*} val Value to strip
 * @returns Stripped text
 */
function strip(val) {
  return (val || "").replace(/^\s*|\s*$/g, "");
}

main()

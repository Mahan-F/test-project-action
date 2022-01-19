# TestProject Job Execution
TestProject Job Execution is a Github action that can be used for running test jobs that are created via the [TestProject](https://testproject.io) platform. The action requires the application ID and API key to be able to call the TestProject APIs and execute all the tests that exist in the given project.

The action will first get a list of all jobs in the project, execute them, and then will check periodically the status of every job until all jobs are finished. If any job fails, the action will also fail so that the CI/CD pipeline does not continue.

## Using the action
To use this action as part of your pipeline, add a new job for testing which will use this action and pass the required parameters `project_id` and `api_key`.
```yaml
name: CI/CD Pipeline

on: 
  push: 
    branches:
      - production

jobs:
  test:
    name: CI Pipeline
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: TestProject Execute Jobs
        uses: Mahan-F/test-project-action@v1
        with:
          project_id: ${{ secrets.TEST_PROJECT_ID }}
          api_key: ${{ secrets.TEST_PROJECT_API_KEY }}
```

In the above snippet, the `project_id` and `api_key` are being fetched from the GitHub project secrets. For more information about how to add and manage project secrets, read the guide from [GiHub Docs](https://docs.github.com/en/actions/security-guides/encrypted-secrets).

## Parameters
`project_id`: The ID of the project on TestProject of which you want to execute tests for.

`api_key`: The API key of your TestProject account. Can be created [here](https://app.testproject.io/#/integrations/api)

`check_interval`: The interval in **seconds** of which the action should check the status of running tests. (Recommended to not make this too short so you will not be spamming TestProject APIs)
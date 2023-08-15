import axios from 'axios';
const TOKEN = '<YOUR GH PERSONAL ACCESS TOKEN>';

const axiosInstance = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28'
  },
  validateStatus: function (status) {
    return status < 400;
  }
});

// create an individual milestone based on a CC Request ticket
function createMilestone(title) {
  return new Promise(async (resolve, reject) => {
    try {
      await axiosInstance.post(`/repos/OWNER/REPO/milestones`, {
        title
      });
      resolve();
    } catch(error) {
      reject(error);
    }
  });
}

// get an object where key is milestone title and value is milestone number
async function getMilestones() {
  try {
    const { data } = await axiosInstance.get('/repos/OWNER/REPO/milestones');
    return data.reduce((obj, { title, number }) => {
      obj[title] = number;
      return obj;
    }, {})
  } catch (error) {
    throw new Error(error);
  }
}

// create the necessary milestones, if they don't exist
async function createMilestones(epics) {
  const promises = [];
  const existingMilestones = await getMilestones();
  epics.forEach((epic) => {
    if (!existingMilestones.hasOwnProperty(epic)) {
      promises.push(createMilestone(epic));
    }
  });
  try {
    await Promise.all(promises);
  } catch(error) {
    console.log(error);
  }
}

const TOKEN2 = '<ZENHUB TOKEN>';
const WORKSPACE_ID = '<WORKSPACE ID>'

const axiosInstance2 = axios.create({
  baseURL: 'https://api.zenhub.com/public/graphql',
  headers: {
    Authorization: `Bearer ${TOKEN2}`,
  }
});

const getEpicsQuery = `query epicsFromWorkspace($workspaceId: ID!, $endCursor: String) {
  workspace(id: $workspaceId) {
    epics (first: 100, after: $endCursor ) {
      nodes {
        id
        issue {
          title
          number
          labels {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`


// get all epics that have a label of "CC-Request"
async function getEpics() {
  const variables = {
    "workspaceId": WORKSPACE_ID,
    endCursor: ''
  }
  let collabEpics = [];
  function isCCEpic({issue}) {
    const { labels } = issue;
    const cc = labels.edges.some(({node}) => node.name === 'CC-Request');
    return cc
  }
  try {
    while (true) {
      const { data } = await axiosInstance2.post('', {
        query: getEpicsQuery,
        variables
      });
      const epics = data.data.workspace.epics.nodes;
      const { pageInfo } = data.data.workspace.epics;
      if (!pageInfo.hasNextPage) {
        break;
      }
      variables.endCursor = pageInfo.endCursor;
      const ccEpics = epics.filter(isCCEpic).map(({ id, issue }) => {
        return { epicId: id, title: issue.title, number: issue.number };
      });
      collabEpics = [...collabEpics, ...ccEpics];
    }
    return collabEpics;
  } catch (error) {
    throw new Error(error);
  }
}

const query2 = `query epicIssues($epicId: ID!) {
  node(id: $epicId) {
    ... on Epic {
      childIssues {
        nodes {
          number
        }
      }
    }
  }
}`;

//find all the issues attached to an epic
async function getIssuesForEpic({ epicId, title, number }) {
  try {
    const { data } = await axiosInstance2.post('', {
    query: query2,
    variables: {
      epicId
    }
    });
    let issues = data.data?.node?.childIssues?.nodes;
    issues = issues ? issues : [];
    const issueNumbers = issues.map(issue => issue.number);
    const milestoneTitle = `${title} ${number}`;
    const _ret = { milestoneTitle, issues: issueNumbers };
    return _ret;
  } catch (error) {
    throw new Error(error);
  }
}

//add a milestone to an issue
function addMilestone(milestone, number) {
  return new Promise(async (resolve, reject) => {
    try {
      await axiosInstance.patch(`/repos/OWNER/REPO/issues/${number}`, {
        milestone
      });
      resolve();
    } catch(error) {
      reject(error);
    }
  });
}

//add milestones to an epic's issues
async function addMilestoneToEpicIssues({ milestoneTitle, issues }) {
  try {
    const promises = issues.map(issue => addMilestone(milestoneTitle, issue));
    await Promise.all(promises);
  } catch (error) {
    throw new Error(error);
  }
}

async function main() {
  try {
    // get the epics
    const epics = await getEpics();
    // generate list of milestones, one for each epic
    const milestones = epics.map(epic => `${epic.title} ${epic.number}`);
    // create any milestones that don't yet exist
    createMilestones(milestones);
    //get the issues that attach to an epic
    const promises = epics.map(epic => getIssuesForEpic(epic));
    const epicsWithIssues = await Promise.all(promises);
    //add milestones to an epic's issues
    const milestonePromises = epicsWithIssues.map(epic => addMilestoneToEpicIssues(epic));
    await Promise.all(milestonePromises);
  } catch (error) {
    throw new Error(error);
  }
}
  
main();

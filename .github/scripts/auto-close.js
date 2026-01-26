module.exports = async ({ github, context }) => {
  const projectNumber = 7; // deine Projektnummer (in der URL: /projects/<number>)
  const owner = context.repo.owner;

  // Hole Projekt-Infos (inkl. Felder)
  const queryProject = `
    query($owner:String!, $projectNumber:Int!) {
      user(login:$owner) {
        projectV2(number:$projectNumber) {
          id
          fields(first:20) {
            nodes {
              ... on ProjectV2FieldCommon { id name }
              ... on ProjectV2SingleSelectField { id name options { id name } }
            }
          }
          items(first:100) {
            nodes {
              id
              fieldValues(first:10) {
                nodes {
                  ... on ProjectV2ItemFieldDateValue {
                    field { ... on ProjectV2FieldCommon { id name } }
                    date
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    field { ... on ProjectV2FieldCommon { id name } }
                    optionId
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const projectData = await github.graphql(queryProject, {
    owner,
    projectNumber
  });

  const project = projectData.user.projectV2;
  const endDateField = project.fields.nodes.find(f => f.name === "End Date");
  const statusField = project.fields.nodes.find(f => f.name === "Status");

  console.log("Available fields:", project.fields.nodes.map(f => ({ name: f.name, options: f.options?.map(o => o.name) })));

  if (!statusField) {
    console.error("Status field not found!");
    return;
  }

  if (!statusField.options) {
    console.error("Status field has no options!");
    return;
  }

  const doneOption = statusField.options.find(o => o.name === "Terminated");

  if (!doneOption) {
    console.error("Terminated option not found. Available options:", statusField.options.map(o => o.name));
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  for (const item of project.items.nodes) {
    const endDateValue = item.fieldValues.nodes.find(
      v => v.field?.name === "End Date"
    );
    const statusValue = item.fieldValues.nodes.find(
      v => v.field?.name === "Status"
    );

    if (endDateValue?.date && endDateValue.date < today) {
      if (statusValue?.name !== "Terminated") {
        console.log(`Setze Item ${item.id} auf Terminated`);
        await github.graphql(`
          mutation($projectId:ID!, $itemId:ID!, $fieldId:ID!, $optionId:String!) {
            updateProjectV2ItemFieldValue(input:{
              projectId:$projectId,
              itemId:$itemId,
              fieldId:$fieldId,
              value:{ singleSelectOptionId:$optionId }
            }) {
              projectV2Item { id }
            }
          }
        `, {
          projectId: project.id,
          itemId: item.id,
          fieldId: statusField.id,
          optionId: doneOption.id
        });
      }
    }
  }
};

import { gql } from '@apollo/client';
export const MUTATION = gql`mutation deleteQuiz($DeleteQuizRequestSchema: DeleteQuizRequestSchema!){
    deleteQuiz(DeleteQuizRequestSchema: $DeleteQuizRequestSchema)
}`
import { gql } from '@apollo/client';
export const MUTATION = gql`mutation deleteQuizPaper($DeleteQuizPaperRequestSchema: DeleteQuizPaperRequestSchema!){
    deleteQuizPaper(DeleteQuizPaperRequestSchema: $DeleteQuizPaperRequestSchema)
}`